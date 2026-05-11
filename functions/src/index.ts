import { setGlobalOptions } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  dealRoles,
  maxRoundsForPlayerCount,
  validateNightAction,
  displayRoleName,
} from "folclore-game-engine";
import type { NightActionInput, RoleId } from "folclore-game-engine";
import {
  db,
  finalizeDay,
  finalizeNight,
  loadPlayers,
  loadSecrets,
  processBotNightActions,
  randomCode,
  randomId,
  ROLE_SIDE,
  startNightSequence,
} from "./helpers.js";

setGlobalOptions({ region: "us-central1", maxInstances: 10, invoker: "public" });

function requireAuth(req: CallableRequest): string {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Auth obrigatória.");
  return req.auth.uid;
}

type AnyPlayer = Record<string, unknown> & { id: string; uid: string };

/** Lookup by playerId (sent from frontend localStorage) with uid as fallback. */
function findPlayer(players: AnyPlayer[], req: CallableRequest): AnyPlayer | undefined {
  const pid = String(req.data?.playerId ?? "");
  if (pid) {
    const byId = players.find((p) => p.id === pid && !p.isBot);
    if (byId) return byId;
  }
  const uid = req.auth?.uid;
  return uid ? findPlayer(players, req) : undefined;
}

export const createRoom = onCall(async (req) => {
  const uid = requireAuth(req);
  const name = String(req.data?.name ?? "Anfitrião").slice(0, 40);
  const expected = Number(req.data?.expectedPlayerCount ?? 5);
  if (expected < 5 || expected > 20) throw new HttpsError("invalid-argument", "expectedPlayerCount inválido.");

  let code = randomCode();
  for (let i = 0; i < 10; i++) {
    const ref = db.collection("rooms").doc(code);
    const snap = await ref.get();
    if (!snap.exists) {
      const playerId = randomId();
      const batch = db.batch();
      batch.set(ref, {
        code,
        hostUid: uid,
        memberUids: [uid],
        expectedPlayerCount: expected,
        status: "lobby",
        round: 0,
        phase: "lobby",
        maxRounds: maxRoundsForPlayerCount(expected),
        spokespersonId: null,
        winner: null,
        individualWins: [],
        nightPhaseIndex: 0,
        currentActorRole: null,
        nightOrderRoles: [],
        geniInvestigatedTargets: [],
        votingOpen: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      batch.set(ref.collection("players").doc(playerId), {
        id: playerId,
        uid,
        name,
        alive: true,
        eliminated: false,
        expelled: false,
        isSpokesperson: false,
      });
      await batch.commit();
      return { roomCode: code, playerId };
    }
    code = randomCode();
  }
  throw new HttpsError("resource-exhausted", "Tente novamente.");
});

export const joinRoom = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const name = String(req.data?.name ?? "Jogador").slice(0, 40);
  if (!code) throw new HttpsError("invalid-argument", "Código inválido.");

  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  const room = roomSnap.data()!;
  if (room.status !== "lobby") throw new HttpsError("failed-precondition", "Partida já iniciada.");

  const playersSnap = await roomRef.collection("players").get();
  if (playersSnap.size >= Number(room.expectedPlayerCount ?? 99)) {
    throw new HttpsError("failed-precondition", "Sala cheia.");
  }

  const playerId = randomId();
  const batch = db.batch();
  batch.update(roomRef, { memberUids: FieldValue.arrayUnion(uid) });
  batch.set(roomRef.collection("players").doc(playerId), {
    id: playerId,
    uid,
    name,
    alive: true,
    eliminated: false,
    expelled: false,
    isSpokesperson: false,
  });
  await batch.commit();
  return { roomCode: code, playerId };
});

export const setExpectedPlayerCount = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const expected = Number(req.data?.expectedPlayerCount);
  if (!code || expected < 5 || expected > 20) throw new HttpsError("invalid-argument", "Parâmetros inválidos.");

  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  if (roomSnap.data()!.hostUid !== uid) throw new HttpsError("permission-denied", "Apenas o anfitrião.");
  await roomRef.update({
    expectedPlayerCount: expected,
    maxRounds: maxRoundsForPlayerCount(expected),
  });
  return { ok: true };
});

export const startGame = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  if (!code) throw new HttpsError("invalid-argument", "Código inválido.");

  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  const room = roomSnap.data()!;
  if (room.hostUid !== uid) throw new HttpsError("permission-denied", "Apenas o anfitrião inicia.");
  if (room.status !== "lobby") throw new HttpsError("failed-precondition", "Jogo já iniciado.");

  const players = await loadPlayers(code);
  if (players.length < 5) throw new HttpsError("failed-precondition", "Mínimo 5 jogadores.");

  const deal = dealRoles(
    players.map((p) => p.id),
    Math.random,
  );

  // In debug mode bots may be in the room — ensure the spokesperson is always a human.
  const botIds = new Set(players.filter((p) => Boolean(p.isBot)).map((p) => p.id));
  let spokespersonId = deal.spokespersonId;
  if (botIds.has(spokespersonId)) {
    const humans = players.filter((p) => !botIds.has(p.id));
    if (humans.length > 0) spokespersonId = humans[Math.floor(Math.random() * humans.length)].id;
  }

  const batch = db.batch();
  for (const p of players) {
    const role = deal.byPlayerId[p.id];
    if (!role) throw new HttpsError("internal", "Sorteio inconsistente.");
    const side = ROLE_SIDE[role];
    batch.set(roomRef.collection("secrets").doc(p.id), { role, side });
    batch.update(roomRef.collection("players").doc(p.id), {
      isSpokesperson: p.id === spokespersonId,
    });
  }

  batch.update(roomRef, {
    status: "night",
    phase: "night",
    round: 1,
    spokespersonId,
    maxRounds: maxRoundsForPlayerCount(players.length),
    individualWins: [],
    geniInvestigatedTargets: [],
    nightPhaseIndex: 0,
  });

  await batch.commit();
  await startNightSequence(code, 1);
  await processBotNightActions(code, 1);
  return { ok: true };
});

export const submitNightAction = onCall(async (req) => {
  requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const action = String(req.data?.action ?? "");
  const targetId = (req.data?.targetId as string | null) ?? null;
  const specialAction = (req.data?.specialAction as string | null) ?? null;
  if (!code) throw new HttpsError("invalid-argument", "Código inválido.");

  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  const room = roomSnap.data()!;
  if (room.status !== "night") throw new HttpsError("failed-precondition", "Não é fase da noite.");

  const players = await loadPlayers(code);
  const secrets = await loadSecrets(code);
  const me = findPlayer(players, req);
  if (!me) throw new HttpsError("permission-denied", "Você não está nesta sala.");
  const mySecret = secrets[me.id];
  if (!mySecret) throw new HttpsError("failed-precondition", "Segredo ausente.");

  const pendingRoles = (room.nightPendingRoles as RoleId[]) ?? [];
  if (!pendingRoles.includes(mySecret.role)) {
    throw new HttpsError("failed-precondition", "Você já agiu ou não tem ação esta noite.");
  }

  const submission: NightActionInput = {
    role: mySecret.role,
    action,
    targetId,
    specialAction,
  };

  if (mySecret.role === "mae_de_santo" && targetId) {
    const target = players.find((p) => p.id === targetId);
    if (!target || !target.eliminated || target.expelled) {
      throw new HttpsError("invalid-argument", "Mãe de Santo só pode invocar jogadores eliminados (não expulsos).");
    }
  }

  const v = validateNightAction(
    {
      round: Number(room.round ?? 1),
      expectedRole: mySecret.role,
      blockedNextNight: Boolean(me.blockedNextNight),
    },
    {
      id: me.id,
      name: String(me.name ?? ""),
      role: mySecret.role,
      side: mySecret.side,
      alive: me.alive !== false,
      eliminated: Boolean(me.eliminated),
      expelled: Boolean(me.expelled),
      blockedNextNight: Boolean(me.blockedNextNight),
      silenced: Boolean(me.silenced),
      silencedRounds: Number(me.silencedRounds ?? 0),
      enchanted: Boolean(me.enchanted),
      seduced: Boolean(me.seduced),
      jailed: Boolean(me.jailed),
      protected: Boolean(me.protected),
      invoked: Boolean(me.invoked),
      doctorLastTargetId: (me.doctorLastTargetId as string | null) ?? null,
      wolfBiteUsed: Boolean(me.wolfBiteUsed),
      mulaExorcizeUsed: Boolean(me.mulaExorcizeUsed),
      geniCharmUsed: Boolean(me.geniCharmUsed),
      catechized: Boolean(me.catechized),
    },
    submission,
  );
  if (!v.ok) throw new HttpsError("invalid-argument", v.error);

  const round = Number(room.round ?? 1);
  const nightRef = roomRef.collection("nightActions").doc(String(round));
  await nightRef.set(
    {
      [me.id]: submission,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // Only track geniInvestigatedTargets when action is "converse", not "charm"
  if (mySecret.role === "geni" && targetId && action === "converse") {
    const prev = (room.geniInvestigatedTargets as string[]) ?? [];
    if (!prev.includes(targetId)) {
      await roomRef.update({ geniInvestigatedTargets: [...prev, targetId] });
    }
  }

  if (mySecret.role === "geni" && action === "charm") {
    await roomRef.collection("players").doc(me.id).update({ geniCharmUsed: true });
  }

  if (mySecret.role === "mula" && action === "exorcize") {
    await roomRef.collection("players").doc(me.id).update({ mulaExorcizeUsed: true });
  }

  if (mySecret.role === "saci") {
    await roomRef.update({ saciActedThisNight: true });
  }

  const newPending = pendingRoles.filter((r) => r !== mySecret.role);

  if (newPending.length === 0) {
    await finalizeNight(code, round);
    return { advanced: true, dawn: true };
  }

  await roomRef.update({ nightPendingRoles: newPending });
  await processBotNightActions(code, round);
  return { advanced: true };
});

export const submitVote = onCall(async (req) => {
  requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const targetId = (req.data?.targetId as string | null) ?? null;
  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  const room = roomSnap.data()!;
  if (room.status !== "day") throw new HttpsError("failed-precondition", "Não é fase do dia.");

  const players = await loadPlayers(code);
  const me = findPlayer(players, req);
  if (!me) throw new HttpsError("permission-denied", "Jogador não encontrado.");
  if (me.seduced || me.jailed || me.alive === false) throw new HttpsError("failed-precondition", "Sem direito a voto.");

  const round = Number(room.votesRound ?? room.round ?? 1);
  await roomRef.collection("votes").doc(String(round)).set(
    { [me.id]: targetId, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  await roomRef.collection("chat").add({
    playerId: me.id,
    name: me.name,
    type: "vote",
    text: `${String(me.name)} votou.`,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

export const sendChatMessage = onCall(async (req) => {
  requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const text = String(req.data?.text ?? "").slice(0, 500);
  if (!code || !text) throw new HttpsError("invalid-argument", "Mensagem inválida.");

  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  if (roomSnap.data()!.status !== "day") throw new HttpsError("failed-precondition", "Chat só no dia.");

  const players = await loadPlayers(code);
  const me = findPlayer(players, req);
  if (!me) throw new HttpsError("permission-denied", "Fora da sala.");
  if (me.silenced) throw new HttpsError("failed-precondition", "Silenciado.");
  const isDead = me.alive === false || Boolean(me.eliminated) || Boolean(me.expelled);
  if (isDead && !me.invoked) throw new HttpsError("failed-precondition", "Você não pode falar.");

  await roomRef.collection("chat").add({
    playerId: me.id,
    name: me.name,
    text,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

export const brasContinueChoice = onCall(async (req) => {
  requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const endGame = Boolean(req.data?.endGame);
  const chosenRole = (req.data?.chosenRole as string | null) ?? null;
  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  const players = await loadPlayers(code);
  const secrets = await loadSecrets(code);
  const me = findPlayer(players, req);
  if (!me || secrets[me.id]?.role !== "bras_cubas") throw new HttpsError("permission-denied", "Apenas Brás Cubas.");

  if (endGame) {
    const revealedRoles: Record<string, string> = {};
    for (const p of players) {
      const r = secrets[p.id]?.role;
      if (r) revealedRoles[p.id] = r;
    }
    await roomRef.update({
      status: "ended",
      phase: "ended",
      winner: me.id,
      pendingBrasChoice: false,
      revealedRoles,
    });
  } else {
    // Brás Cubas can return as any role present in the game (or aldeao as fallback)
    const validRoles = Object.keys(ROLE_SIDE) as import("folclore-game-engine").RoleId[];
    const resolvedRole = (chosenRole && validRoles.includes(chosenRole as import("folclore-game-engine").RoleId))
      ? (chosenRole as import("folclore-game-engine").RoleId)
      : "aldeao";
    await roomRef.collection("secrets").doc(me.id).update({ role: resolvedRole, side: ROLE_SIDE[resolvedRole] });
    await roomRef.collection("players").doc(me.id).update({ alive: true, expelled: false, mulaExorcizeUsed: false, geniCharmUsed: false, wolfBiteUsed: false, individualObjectiveMet: false });
    await roomRef.update({ pendingBrasChoice: false, votingOpen: false });
    const r = Number(roomSnap.data()!.round ?? 1) + 1;
    await startNightSequence(code, r);
    await processBotNightActions(code, r);
  }
  return { ok: true };
});

export const coronelStartAccusation = onCall(async (req) => {
  requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const targetId = String(req.data?.targetId ?? "");
  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  if (roomSnap.data()!.status !== "day") throw new HttpsError("failed-precondition", "Só de dia.");

  const secrets = await loadSecrets(code);
  const players = await loadPlayers(code);
  const me = findPlayer(players, req);
  if (!me || secrets[me.id]?.role !== "coronel") throw new HttpsError("permission-denied", "Apenas o Coronel.");

  await roomRef.update({
    daySubPhase: "coronel_accusation",
    coronelAccusationTarget: targetId,
    coronelVotesYes: {},
  });
  return { ok: true };
});

export const coronelAccusationVote = onCall(async (req) => {
  requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const yes = Boolean(req.data?.yes);
  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  const room = roomSnap.data()!;
  if (room.daySubPhase !== "coronel_accusation") throw new HttpsError("failed-precondition", "Sem acusação ativa.");

  const players = await loadPlayers(code);
  const me = findPlayer(players, req);
  if (!me) throw new HttpsError("permission-denied", "Fora da sala.");

  const votes = { ...(room.coronelVotesYes as Record<string, boolean>) };
  votes[me.id] = yes;
  await roomRef.update({ coronelVotesYes: votes });

  const alive = players.filter((p) => p.alive !== false && !p.eliminated && !p.expelled);
  if (Object.keys(votes).length < alive.length) return { pending: true };

  const yesCount = Object.values(votes).filter(Boolean).length;
  const majority = yesCount * 2 > alive.length;
  const secrets = await loadSecrets(code);
  const targetId = String(room.coronelAccusationTarget ?? "");
  const targetRole = secrets[targetId]?.role;

  const coronelPlayer = players.find((p) => secrets[p.id]?.role === "coronel");

  if (majority && targetRole === "boitata") {
    const b = db.batch();
    b.update(roomRef.collection("players").doc(targetId), { alive: false, eliminated: true });
    if (coronelPlayer) {
      b.update(roomRef.collection("players").doc(coronelPlayer.id), { individualObjectiveMet: true });
    }
    b.update(roomRef, { daySubPhase: "idle", coronelVotesYes: {} });
    await b.commit();
  } else if (majority) {
    const coronelName = coronelPlayer?.name ?? "Coronel";
    const logRef = roomRef.collection("publicLogEntries").doc();
    const b2 = db.batch();
    b2.update(roomRef, { daySubPhase: "idle", coronelVotesYes: {}, coronelRevealed: true });
    b2.set(logRef, {
      round: room.round ?? 1,
      type: "special",
      message: `O Coronel errou a acusação formal. ${coronelName} revela-se como Coronel.`,
      timestamp: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    });
    await b2.commit();
  } else {
    await roomRef.update({ daySubPhase: "idle", coronelVotesYes: {} });
  }
  return { resolved: true };
});

export const cangaceiroTiroCerto = onCall(async (req) => {
  requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const targetId = String(req.data?.targetId ?? "");
  const roomRef = db.collection("rooms").doc(code);
  const players = await loadPlayers(code);
  const secrets = await loadSecrets(code);
  const me = findPlayer(players, req);
  if (!me || secrets[me.id]?.role !== "cangaceiro") throw new HttpsError("permission-denied", "Apenas Cangaceiro.");

  const roomSnap = await roomRef.get();
  const round = Number(roomSnap.data()?.round ?? 1);
  const history = (roomSnap.data()?.geniInvestigatedTargets as string[]) ?? [];
  const geniPid = players.find((p) => secrets[p.id]?.role === "geni")?.id;
  const consulted = Boolean(geniPid && history.includes(targetId));
  const targetRole = secrets[targetId]?.role;
  const isCreature = targetRole && ["lobisomem", "saci", "mula", "boto", "iara"].includes(targetRole);

  if (isCreature) {
    await roomRef.collection("players").doc(targetId).update({ alive: false, eliminated: true });
    const wins = [...((roomSnap.data()?.individualWins as unknown[]) ?? [])];
    if (targetRole === "iara") {
      wins.push({
        playerId: me.id,
        role: "cangaceiro",
        type: "cangaceiro_iara",
        round,
        timestamp: Date.now(),
      });
    }
    await roomRef.update({ individualWins: wins });
  } else {
    const b = db.batch();
    b.update(roomRef.collection("players").doc(targetId), { alive: false, eliminated: true });
    b.update(roomRef.collection("players").doc(me.id), {
      alive: false,
      eliminated: true,
      publicReveal: "cangaceiro",
    });
    const logRef = roomRef.collection("publicLogEntries").doc();
    b.set(logRef, {
      round,
      type: "special",
      message: `O Cangaceiro errou o tiro. ${me.name} é revelado como Cangaceiro; ${displayRoleName(targetRole!)} foi eliminado por engano.`,
      timestamp: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    });
    await b.commit();
  }

  return { hit: Boolean(isCreature), consulted };
});

export const saciGorroSwap = onCall(async (req) => {
  requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const withId = String(req.data?.swapWithPlayerId ?? "");
  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.data()?.pendingSaciGorro) throw new HttpsError("failed-precondition", "Sem oferta ativa.");

  const players = await loadPlayers(code);
  const secrets = await loadSecrets(code);
  const me = findPlayer(players, req);
  if (!me || secrets[me.id]?.role !== "saci") throw new HttpsError("permission-denied", "Apenas Saci.");

  const batch = db.batch();
  const mySecret = { ...secrets[me.id] };
  const otherSecret = { ...secrets[withId] };
  batch.set(roomRef.collection("secrets").doc(me.id), otherSecret);
  batch.set(roomRef.collection("secrets").doc(withId), mySecret);
  batch.update(roomRef, { pendingSaciGorro: false });
  await batch.commit();
  return { ok: true };
});

const BOT_NAMES = [
  "Eustácio", "Muriel", "Severino", "Benedita", "Álvaro",
  "Dona Chica", "Bentinho", "Gabriela", "Maneca", "Dorinha",
  "Lampião", "Maria Bonita", "Catirina", "Mestre Vital", "Caboclo",
];

export const addBots = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const count = Math.min(Math.max(Number(req.data?.count ?? 4), 1), 15);
  if (!code) throw new HttpsError("invalid-argument", "Código inválido.");

  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  const room = roomSnap.data()!;
  if (room.hostUid !== uid) throw new HttpsError("permission-denied", "Apenas o anfitrião.");
  if (room.status !== "lobby") throw new HttpsError("failed-precondition", "Jogo já iniciado.");

  const batch = db.batch();
  for (let i = 0; i < count; i++) {
    const botId = randomId();
    batch.set(roomRef.collection("players").doc(botId), {
      id: botId,
      uid: `bot_${botId}`,
      name: BOT_NAMES[i % BOT_NAMES.length],
      alive: true,
      eliminated: false,
      expelled: false,
      isSpokesperson: false,
      isBot: true,
    });
  }
  await batch.commit();
  return { ok: true, count };
});

export const markSaciGorroOffer = onCall(async (req) => {
  requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const roomRef = db.collection("rooms").doc(code);
  const players = await loadPlayers(code);
  const secrets = await loadSecrets(code);
  const me = findPlayer(players, req);
  if (!me || secrets[me.id]?.role !== "saci") throw new HttpsError("permission-denied", "Apenas Saci.");
  await roomRef.update({ pendingSaciGorro: true });
  return { ok: true };
});

export const startNight = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  if (!code) throw new HttpsError("invalid-argument", "Código inválido.");

  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  const room = roomSnap.data()!;
  if (room.hostUid !== uid) throw new HttpsError("permission-denied", "Apenas o anfitrião pode iniciar a noite.");
  if (!room.pendingNightStart) throw new HttpsError("failed-precondition", "Noite ainda não pronta para iniciar.");

  const nextRound = Number(room.pendingNightRound ?? (Number(room.round ?? 1) + 1));
  await roomRef.update({ pendingNightStart: false, pendingNightRound: null });
  await startNightSequence(code, nextRound);
  await processBotNightActions(code, nextRound);
  return { ok: true };
});

export const advanceDay = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  if (!code) throw new HttpsError("invalid-argument", "Código inválido.");

  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  const room = roomSnap.data()!;
  if (room.hostUid !== uid) throw new HttpsError("permission-denied", "Apenas o anfitrião pode encerrar o dia.");
  if (room.status !== "day") throw new HttpsError("failed-precondition", "Não é fase do dia.");

  const round = Number(room.votesRound ?? room.round ?? 1);
  await finalizeDay(code, round);
  return { ok: true };
});

export const restartGame = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  if (!code) throw new HttpsError("invalid-argument", "Código inválido.");

  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  const room = roomSnap.data()!;
  if (room.hostUid !== uid) throw new HttpsError("permission-denied", "Apenas o anfitrião pode recomeçar.");
  if (room.status !== "ended") throw new HttpsError("failed-precondition", "O jogo ainda não encerrou.");

  await db.recursiveDelete(roomRef.collection("secrets"));
  await db.recursiveDelete(roomRef.collection("nightActions"));
  await db.recursiveDelete(roomRef.collection("votes"));
  await db.recursiveDelete(roomRef.collection("publicLogEntries"));
  await db.recursiveDelete(roomRef.collection("privateLog"));
  await db.recursiveDelete(roomRef.collection("chat"));

  const players = await loadPlayers(code);
  const batch = db.batch();
  for (const p of players) {
    batch.update(roomRef.collection("players").doc(p.id), {
      alive: true,
      eliminated: false,
      expelled: false,
      blockedNextNight: false,
      silenced: false,
      silencedRounds: 0,
      enchanted: false,
      seduced: false,
      jailed: false,
      protected: false,
      invoked: false,
      doctorLastTargetId: null,
      wolfBiteUsed: false,
      mulaExorcizeUsed: false,
      geniCharmUsed: false,
      catechized: false,
      individualObjectiveMet: false,
      isSpokesperson: false,
    });
  }

  batch.update(roomRef, {
    status: "lobby",
    phase: "lobby",
    round: 0,
    winner: null,
    individualWins: [],
    spokespersonId: null,
    nightPhaseIndex: 0,
    currentActorRole: null,
    nightOrderRoles: [],
    nightPendingRoles: [],
    votingOpen: false,
    saciActedLastNight: false,
    saciActedThisNight: false,
    geniInvestigatedTargets: [],
    pendingBrasChoice: false,
    pendingSaciGorro: false,
    botoEnchantedMoradores: [],
    padreCatechizedMoradores: [],
    revealedRoles: {},
  });

  await batch.commit();
  return { ok: true };
});
