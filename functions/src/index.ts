import { setGlobalOptions } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  dealRoles,
  maxRoundsForPlayerCount,
  validateNightAction,
  tallyExpulsionVotes,
  checkCollectiveWin,
  displayRoleName,
} from "folclore-game-engine";
import type { NightActionInput, RoleId } from "folclore-game-engine";
import {
  db,
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
  const uid = requireAuth(req);
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
  const me = players.find((p) => p.uid === uid);
  if (!me) throw new HttpsError("permission-denied", "Você não está nesta sala.");
  const mySecret = secrets[me.id];
  if (!mySecret) throw new HttpsError("failed-precondition", "Segredo ausente.");

  const expectedRole = room.currentActorRole as RoleId | null;
  if (!expectedRole || mySecret.role !== expectedRole) {
    throw new HttpsError("failed-precondition", "Não é sua vez.");
  }

  const submission: NightActionInput = {
    role: mySecret.role,
    action,
    targetId,
    specialAction,
  };

  const v = validateNightAction(
    {
      round: Number(room.round ?? 1),
      expectedRole,
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

  if (mySecret.role === "geni" && targetId) {
    const prev = (room.geniInvestigatedTargets as string[]) ?? [];
    await roomRef.update({ geniInvestigatedTargets: [...prev, targetId] });
  }

  if (mySecret.role === "saci") {
    await roomRef.update({ saciActedThisNight: true });
  }

  const order = (room.nightOrderRoles as RoleId[]) ?? [];
  let idx = Number(room.nightPhaseIndex ?? 0);
  idx += 1;
  const nextRole = order[idx] ?? null;

  if (!nextRole) {
    await finalizeNight(code, round);
    return { advanced: true, dawn: true };
  }

  await roomRef.update({ nightPhaseIndex: idx, currentActorRole: nextRole });
  await processBotNightActions(code, round);
  return { advanced: true, currentActorRole: nextRole };
});

export const openVoting = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  const room = roomSnap.data()!;
  const players = await loadPlayers(code);
  const me = players.find((p) => p.uid === uid);
  if (!me || me.id !== room.spokespersonId) throw new HttpsError("permission-denied", "Apenas o porta-voz.");

  const round = Number(room.round ?? 1);
  await roomRef.update({ votingOpen: true, votesRound: round });

  // Auto-vote for any bot players
  const botIds = new Set(players.filter((p) => Boolean(p.isBot)).map((p) => p.id));
  if (botIds.size > 0) {
    const alive = players.filter((p) => p.alive !== false && !p.eliminated && !p.expelled);
    const aliveHumans = alive.filter((p) => !botIds.has(p.id));
    const botVotes: Record<string, string | null> = {};
    for (const p of alive) {
      if (!botIds.has(p.id) || p.seduced || p.jailed) continue;
      const targets = aliveHumans.filter((t) => t.id !== p.id);
      botVotes[p.id] = targets.length > 0
        ? targets[Math.floor(Math.random() * targets.length)].id
        : null;
    }
    if (Object.keys(botVotes).length > 0) {
      await roomRef.collection("votes").doc(String(round)).set(
        { ...botVotes, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
  }

  return { ok: true };
});

export const submitVote = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const targetId = (req.data?.targetId as string | null) ?? null;
  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  const room = roomSnap.data()!;
  if (room.status !== "day" || !room.votingOpen) {
    throw new HttpsError("failed-precondition", "Votação fechada.");
  }

  const players = await loadPlayers(code);
  const secrets = await loadSecrets(code);
  const me = players.find((p) => p.uid === uid);
  if (!me) throw new HttpsError("permission-denied", "Jogador não encontrado.");
  if (me.seduced || me.jailed || me.alive === false) throw new HttpsError("failed-precondition", "Sem direito a voto.");

  const round = Number(room.votesRound ?? room.round ?? 1);
  await roomRef.collection("votes").doc(String(round)).set(
    {
      [me.id]: targetId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { ok: true };
});

export const closeVoting = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  const room = roomSnap.data()!;
  const players = await loadPlayers(code);
  const me = players.find((p) => p.uid === uid);
  if (!me || me.id !== room.spokespersonId) throw new HttpsError("permission-denied", "Apenas o porta-voz.");

  const round = Number(room.votesRound ?? room.round ?? 1);
  const voteSnap = await roomRef.collection("votes").doc(String(round)).get();
  const votesRaw = voteSnap.data() ?? {};
  const votes = Object.entries(votesRaw)
    .filter(([k]) => k !== "updatedAt")
    .map(([voterId, targetId]) => ({ voterId, targetId: (targetId as string) || null }));

  const secrets = await loadSecrets(code);
  const roleByPlayerId: Record<string, RoleId> = {};
  for (const p of players) {
    const s = secrets[p.id];
    if (s) roleByPlayerId[p.id] = s.role;
  }

  const brasId = players.find((p) => secrets[p.id]?.role === "bras_cubas")?.id ?? null;
  const tally = tallyExpulsionVotes(votes, {
    doubleVotesOnBras: Boolean(room.saciActedLastNight),
    brasPlayerId: brasId,
    enchantedVoterIds: new Set(players.filter((p) => p.enchanted).map((p) => p.id)),
    roleByPlayerId,
  });

  const batch = db.batch();
  if (tally.expelledId) {
    const ref = roomRef.collection("players").doc(tally.expelledId);
    const expelled = players.find((p) => p.id === tally.expelledId)!;
    const role = secrets[tally.expelledId]!.role;
    batch.update(ref, { alive: false, expelled: true });
    const msgType = role === "bras_cubas" ? "special" : "expulsion";
    const msg =
      role === "bras_cubas"
        ? `Espera. ${expelled.name} sorri. Era o Tolo — e ser expulso era exatamente o que queria.`
        : `${expelled.name} é expulso(a) da cidade. Era ${displayRoleName(role)}.`;

    const logRef = roomRef.collection("publicLogEntries").doc();
    batch.set(logRef, {
      round,
      type: msgType,
      message: msg,
      timestamp: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    });

    if (role === "bras_cubas") {
      batch.update(roomRef, { pendingBrasChoice: true, votingOpen: false });
    } else {
      batch.update(roomRef, { votingOpen: false });
    }
  } else {
    batch.update(roomRef, { votingOpen: false });
  }

  await batch.commit();

  if (tally.expelledId && secrets[tally.expelledId]?.role !== "bras_cubas") {
    const snaps = await loadPlayers(code);
    const sec = await loadSecrets(code);
    const winPlayers: Record<string, import("folclore-game-engine").WinPlayerSnapshot> = {};
    for (const p of snaps) {
      const r = sec[p.id]?.role;
      if (!r) continue;
      winPlayers[p.id] = {
        id: p.id,
        role: r,
        alive: p.alive !== false,
        eliminated: Boolean(p.eliminated),
        expelled: Boolean(p.expelled),
        individualObjectiveMet: Boolean(p.individualObjectiveMet),
      };
    }
    const w = checkCollectiveWin(winPlayers, round, Number(room.maxRounds ?? 7));
    if (w) {
      await roomRef.update({ status: "ended", phase: "ended", winner: w, votingOpen: false });
    } else {
      const nextRound = round + 1;
      await startNightSequence(code, nextRound);
    }
  }

  return { expelledId: tally.expelledId, counts: tally.counts };
});

export const sendChatMessage = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const text = String(req.data?.text ?? "").slice(0, 500);
  if (!code || !text) throw new HttpsError("invalid-argument", "Mensagem inválida.");

  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  if (roomSnap.data()!.status !== "day") throw new HttpsError("failed-precondition", "Chat só no dia.");

  const players = await loadPlayers(code);
  const me = players.find((p) => p.uid === uid);
  if (!me) throw new HttpsError("permission-denied", "Fora da sala.");
  if (me.silenced) throw new HttpsError("failed-precondition", "Silenciado.");

  await roomRef.collection("chat").add({
    playerId: me.id,
    name: me.name,
    text,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

export const brasContinueChoice = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const endGame = Boolean(req.data?.endGame);
  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  const players = await loadPlayers(code);
  const secrets = await loadSecrets(code);
  const me = players.find((p) => p.uid === uid);
  if (!me || secrets[me.id]?.role !== "bras_cubas") throw new HttpsError("permission-denied", "Apenas Brás Cubas.");

  if (endGame) {
    await roomRef.update({
      status: "ended",
      phase: "ended",
      winner: me.id,
      pendingBrasChoice: false,
    });
  } else {
    await roomRef.collection("secrets").doc(me.id).update({ role: "aldeao", side: ROLE_SIDE["aldeao"] });
    await roomRef.collection("players").doc(me.id).update({ alive: true, expelled: false });
    await roomRef.update({ pendingBrasChoice: false, votingOpen: false });
    const r = Number(roomSnap.data()!.round ?? 1) + 1;
    await startNightSequence(code, r);
  }
  return { ok: true };
});

export const coronelStartAccusation = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const targetId = String(req.data?.targetId ?? "");
  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  if (roomSnap.data()!.status !== "day") throw new HttpsError("failed-precondition", "Só de dia.");

  const secrets = await loadSecrets(code);
  const players = await loadPlayers(code);
  const me = players.find((p) => p.uid === uid);
  if (!me || secrets[me.id]?.role !== "coronel") throw new HttpsError("permission-denied", "Apenas o Coronel.");

  await roomRef.update({
    daySubPhase: "coronel_accusation",
    coronelAccusationTarget: targetId,
    coronelVotesYes: {},
  });
  return { ok: true };
});

export const coronelAccusationVote = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const yes = Boolean(req.data?.yes);
  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  const room = roomSnap.data()!;
  if (room.daySubPhase !== "coronel_accusation") throw new HttpsError("failed-precondition", "Sem acusação ativa.");

  const players = await loadPlayers(code);
  const me = players.find((p) => p.uid === uid);
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
  const uid = requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const targetId = String(req.data?.targetId ?? "");
  const roomRef = db.collection("rooms").doc(code);
  const players = await loadPlayers(code);
  const secrets = await loadSecrets(code);
  const me = players.find((p) => p.uid === uid);
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
  const uid = requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const withId = String(req.data?.swapWithPlayerId ?? "");
  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.data()?.pendingSaciGorro) throw new HttpsError("failed-precondition", "Sem oferta ativa.");

  const players = await loadPlayers(code);
  const secrets = await loadSecrets(code);
  const me = players.find((p) => p.uid === uid);
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
  "Zé das Almas", "Maria Padilha", "Severino", "Benedita", "Chico Brabo",
  "Antônia Brava", "Raimundo", "Eulália", "Maneca", "Dorinha",
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
  const uid = requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const roomRef = db.collection("rooms").doc(code);
  const players = await loadPlayers(code);
  const secrets = await loadSecrets(code);
  const me = players.find((p) => p.uid === uid);
  if (!me || secrets[me.id]?.role !== "saci") throw new HttpsError("permission-denied", "Apenas Saci.");
  await roomRef.update({ pendingSaciGorro: true });
  return { ok: true };
});
