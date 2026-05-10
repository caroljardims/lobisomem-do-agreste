import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import type { NightActionInput, PlayerDawnState, Side, WinPlayerSnapshot } from "folclore-game-engine";
import {
  NIGHT_ACTION_ORDER,
  ROLE_SIDE,
  resolveDawn,
  DAY_OPENING,
  tallyExpulsionVotes,
  checkCollectiveWin,
  displayRoleName,
} from "folclore-game-engine";
import type { RoleId } from "folclore-game-engine";

/** Deve rodar antes de `getFirestore()` — o deploy analisa o módulo antes do corpo de `index.ts`. */
if (!getApps().length) {
  initializeApp();
}

export const db = getFirestore();

export function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const len = 4;
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function loadPlayers(roomCode: string) {
  const snap = await db.collection("rooms").doc(roomCode).collection("players").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<
    Record<string, unknown> & { id: string; uid: string; name?: string }
  >;
}

export async function loadSecrets(roomCode: string) {
  const snap = await db.collection("rooms").doc(roomCode).collection("secrets").get();
  const map: Record<string, { role: RoleId; side: Side }> = {};
  for (const d of snap.docs) {
    const data = d.data() as { role: RoleId; side: Side };
    map[d.id] = data;
  }
  return map;
}

export function nightRolesInPlay(secrets: Record<string, { role: RoleId }>, alive: Set<string>): RoleId[] {
  const inGame = new Set<RoleId>();
  for (const pid of alive) {
    const s = secrets[pid];
    if (s) inGame.add(s.role);
  }
  return NIGHT_ACTION_ORDER.filter((r) => inGame.has(r));
}

export async function startNightSequence(roomCode: string, round: number) {
  const players = await loadPlayers(roomCode);
  const secrets = await loadSecrets(roomCode);
  const alive = new Set(
    players.filter((p) => p.alive !== false && !p.eliminated && !p.expelled).map((p) => p.id),
  );
  const order = nightRolesInPlay(secrets, alive);
  await db
    .collection("rooms")
    .doc(roomCode)
    .update({
      status: "night",
      phase: "night",
      round,
      nightPhaseIndex: 0,
      currentActorRole: null,
      nightOrderRoles: order,
      nightPendingRoles: order,
      saciActedThisNight: false,
    });
}

export async function finalizeNight(roomCode: string, round: number) {
  const roomRef = db.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  const room = roomSnap.data() ?? {};
  if (room.status !== "night") return;
  const geniHistory = (room.geniInvestigatedTargets as string[] | undefined) ?? [];

  const players = await loadPlayers(roomCode);
  const secrets = await loadSecrets(roomCode);
  const nightSnap = await roomRef.collection("nightActions").doc(String(round)).get();
  const raw = nightSnap.data() ?? {};
  const nightActions: Record<string, NightActionInput | undefined> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "createdAt" || k === "updatedAt") continue;
    nightActions[k] = v as NightActionInput;
  }

  const geniPid = players.find((p) => secrets[p.id]?.role === "geni")?.id;
  const geniInvestigatedIds: Record<string, string[]> = {};
  if (geniPid) geniInvestigatedIds[geniPid] = [...geniHistory];

  const dawnPlayers: Record<string, PlayerDawnState> = {};
  for (const p of players) {
    const sec = secrets[p.id];
    if (!sec) continue;
    dawnPlayers[p.id] = {
      id: p.id,
      name: String(p.name ?? ""),
      role: sec.role,
      side: sec.side,
      alive: p.alive !== false,
      eliminated: Boolean(p.eliminated),
      expelled: Boolean(p.expelled),
      blockedNextNight: Boolean(p.blockedNextNight),
      silenced: Boolean(p.silenced),
      silencedRounds: Number(p.silencedRounds ?? 0),
      enchanted: Boolean(p.enchanted),
      seduced: Boolean(p.seduced),
      jailed: Boolean(p.jailed),
      protected: Boolean(p.protected),
      invoked: Boolean(p.invoked),
      doctorLastTargetId: (p.doctorLastTargetId as string | null) ?? null,
      wolfBiteUsed: Boolean(p.wolfBiteUsed),
    };
  }

  const now = Date.now();
  const res = resolveDawn({
    round,
    now,
    players: dawnPlayers,
    nightActions,
    geniInvestigatedIds,
  });

  const batch = db.batch();
  for (const [pid, pl] of Object.entries(res.players)) {
    const ref = roomRef.collection("players").doc(pid);
    const upd: Record<string, unknown> = {
      alive: pl.alive,
      eliminated: pl.eliminated,
      expelled: pl.expelled,
      blockedNextNight: pl.blockedNextNight,
      silenced: pl.silenced,
      silencedRounds: pl.silencedRounds,
      enchanted: pl.enchanted,
      seduced: pl.seduced,
      jailed: pl.jailed,
      invoked: pl.invoked,
      doctorLastTargetId: pl.doctorLastTargetId ?? null,
    };
    if (pl.silenced) upd.silencedUntil = Timestamp.fromMillis(now + 120_000);
    else upd.silencedUntil = FieldValue.delete();
    batch.update(ref, upd);
  }

  for (const e of res.publicLog) {
    const ref = roomRef.collection("publicLogEntries").doc();
    batch.set(ref, { ...e, createdAt: FieldValue.serverTimestamp() });
  }

  for (const [pid, entries] of Object.entries(res.privateLog)) {
    for (const e of entries) {
      const ref = roomRef.collection("privateLog").doc(pid).collection("entries").doc();
      batch.set(ref, { ...e, createdAt: FieldValue.serverTimestamp() });
    }
  }

  const wins = [...((room.individualWins as unknown[]) ?? []), ...res.individualWins];

  let saciActed = false;
  for (const [pid, a] of Object.entries(nightActions)) {
    if (a?.role === "saci" && secrets[pid]?.role === "saci") {
      saciActed = true;
      break;
    }
  }

  batch.update(roomRef, {
    status: "day",
    phase: "day",
    currentActorRole: null,
    nightPhaseIndex: 0,
    nightOrderRoles: [],
    nightPendingRoles: [],
    votingOpen: true,
    votesRound: round,
    saciActedLastNight: saciActed,
    individualWins: wins,
    geniInvestigatedTargets: [],
  });

  const openRef = roomRef.collection("publicLogEntries").doc();
  batch.set(openRef, {
    round,
    type: "dawn",
    message: DAY_OPENING,
    timestamp: now,
    createdAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  // Auto-vote for bots now that day has started
  const botIds = new Set(players.filter((p) => Boolean(p.isBot)).map((p) => p.id));

  // Bot chat message at dawn
  const BOT_PHRASES = [
    "Não dormiu bem essa noite não, não…",
    "Tem coisa estranha acontecendo por aqui.",
    "Eu não sei de nada, mas suspeito de tudo.",
    "Essa noite tava silenciosa demais pra ser inocente.",
    "Alguém aqui sabe mais do que tá mostrando.",
    "Vou ficar de olho em todo mundo hoje.",
    "Se ficar quieto parece suspeito. Se falar parece suspeito. Que dilema.",
    "O sertão não perdoa quem acredita demais.",
    "Cuidado com quem sorri muito de manhã.",
    "Mais uma noite que passou. Será que vai ter mais uma?",
  ];
  const botPlayers = Object.values(res.players).filter(
    (p) => p.alive && !p.eliminated && !p.expelled && !p.silenced && botIds.has(p.id),
  );
  if (botPlayers.length > 0) {
    const chatBot = botPlayers[Math.floor(Math.random() * botPlayers.length)];
    const phrase = BOT_PHRASES[Math.floor(Math.random() * BOT_PHRASES.length)];
    await roomRef.collection("chat").add({
      playerId: chatBot.id,
      name: chatBot.name,
      text: phrase,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  if (botIds.size > 0) {
    const aliveNow = Object.values(res.players).filter((p) => p.alive && !p.eliminated && !p.expelled);
    const aliveHumans = aliveNow.filter((p) => !botIds.has(p.id));
    const botVotes: Record<string, string | null> = {};
    for (const p of aliveNow) {
      if (!botIds.has(p.id) || p.seduced || p.jailed) continue;
      const targets = aliveHumans.filter((t) => t.id !== p.id);
      botVotes[p.id] = targets.length > 0 ? targets[Math.floor(Math.random() * targets.length)].id : null;
    }
    if (Object.keys(botVotes).length > 0) {
      await roomRef.collection("votes").doc(String(round)).set(
        { ...botVotes, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
  }
}

export async function finalizeDay(roomCode: string, round: number) {
  const roomRef = db.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  const room = roomSnap.data() ?? {};
  if (room.status !== "day" || room.votingOpen === false) return;

  const players = await loadPlayers(roomCode);
  const secrets = await loadSecrets(roomCode);

  const voteSnap = await roomRef.collection("votes").doc(String(round)).get();
  const votesRaw = voteSnap.data() ?? {};
  const votes = Object.entries(votesRaw)
    .filter(([k]) => k !== "updatedAt")
    .map(([voterId, targetId]) => ({ voterId, targetId: (targetId as string) || null }));

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
    const expelled = players.find((p) => p.id === tally.expelledId)!;
    const role = secrets[tally.expelledId]!.role;
    batch.update(roomRef.collection("players").doc(tally.expelledId), { alive: false, expelled: true });
    const msg =
      role === "bras_cubas"
        ? `Espera. ${expelled.name} sorri. Era o Tolo — e ser expulso era exatamente o que queria.`
        : `${expelled.name} é expulso(a) da cidade. Era ${displayRoleName(role)}.`;
    batch.set(roomRef.collection("publicLogEntries").doc(), {
      round,
      type: role === "bras_cubas" ? "special" : "expulsion",
      message: msg,
      timestamp: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.update(roomRef, {
      votingOpen: false,
      ...(role === "bras_cubas" ? { pendingBrasChoice: true } : {}),
    });
  } else {
    batch.update(roomRef, { votingOpen: false });
  }
  await batch.commit();

  if (!tally.expelledId || secrets[tally.expelledId]?.role === "bras_cubas") {
    if (tally.expelledId) return; // bras_cubas waits for player choice
    // No expulsion — advance to next night
    const nextRound = round + 1;
    await startNightSequence(roomCode, nextRound);
    await processBotNightActions(roomCode, nextRound);
    return;
  }

  // Someone expelled — check win condition
  const snaps = await loadPlayers(roomCode);
  const sec = await loadSecrets(roomCode);
  const winPlayers: Record<string, WinPlayerSnapshot> = {};
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
    const revealedRoles: Record<string, string> = {};
    for (const p of snaps) {
      const r = sec[p.id]?.role;
      if (r) revealedRoles[p.id] = r;
    }
    await roomRef.update({ status: "ended", phase: "ended", winner: w, votingOpen: false, revealedRoles });
  } else {
    const nextRound = round + 1;
    await startNightSequence(roomCode, nextRound);
    await processBotNightActions(roomCode, nextRound);
  }
}

const BOT_ROLE_ACTIONS: Partial<Record<string, string>> = {
  lobisomem: "eliminate",
  saci: "steal",
  mula: "terrorize",
  boto: "enchant",
  iara: "seduce",
  curupira: "protect",
  doutor: "save",
  mae_de_santo: "invoke",
  geni: "converse",
  boitata: "investigate",
  cartomante: "investigate",
  delegado: "jail",
  cangaceiro: "query",
};

export async function processBotNightActions(roomCode: string, round: number): Promise<void> {
  const roomRef = db.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  const room = roomSnap.data() ?? {};

  const pendingRoles = (room.nightPendingRoles as RoleId[]) ?? [];
  if (pendingRoles.length === 0) return;

  const players = await loadPlayers(roomCode);
  const secrets = await loadSecrets(roomCode);

  const botIds = new Set(players.filter((p) => Boolean(p.isBot)).map((p) => p.id));
  if (botIds.size === 0) return;

  const alive = players.filter((p) => p.alive !== false && !p.eliminated && !p.expelled);
  const eliminated = players.filter((p) => p.eliminated && !p.expelled);

  const nightRef = roomRef.collection("nightActions").doc(String(round));
  const remainingPending: RoleId[] = [];
  let saciActed = false;

  for (const role of pendingRoles) {
    const actor = alive.find((p) => secrets[p.id]?.role === role);

    if (!actor || !botIds.has(actor.id)) {
      remainingPending.push(role);
      continue;
    }

    let targets = alive.filter((p) => p.id !== actor.id);
    if (role === "mae_de_santo") {
      targets = eliminated.filter((p) => p.id !== actor.id);
    }
    const targetId =
      targets.length > 0 ? targets[Math.floor(Math.random() * targets.length)].id : null;

    const action = BOT_ROLE_ACTIONS[role] ?? "eliminate";
    let specialAction: string | null = null;
    if ((role === "curupira" || role === "boitata") && round === 1) {
      specialAction = Math.random() < 0.5 ? "moradores" : "criaturas";
    }
    if (role === "delegado" && targetId) {
      const targetName = alive.find((p) => p.id === targetId)?.name ?? "o suspeito";
      const motivos = [
        `${targetName} foi visto rondando a praça depois do toque de recolher.`,
        `Denúncia anônima aponta ${targetName} como perturbador da ordem pública.`,
        `${targetName} apresentou comportamento suspeito na última reunião.`,
        `Ordens do Coronel: ${targetName} precisa ser contido.`,
        `${targetName} foi flagrado próximo aos celeiros na madrugada.`,
        `Testemunha ocular viu ${targetName} nas bordas da caatinga à noite.`,
        `${targetName} descumpriu o toque de recolher por três noites seguidas.`,
        `Há indícios de que ${targetName} está espalhando boatos contra a ordem.`,
      ];
      specialAction = motivos[Math.floor(Math.random() * motivos.length)];
    }

    const submission: NightActionInput = {
      role: role as RoleId,
      action,
      targetId,
      specialAction,
    };

    await nightRef.set(
      { [actor.id]: submission, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    if (role === "geni" && targetId) {
      const snap = await roomRef.get();
      const prev = (snap.data()?.geniInvestigatedTargets as string[]) ?? [];
      if (!prev.includes(targetId)) {
        await roomRef.update({ geniInvestigatedTargets: [...prev, targetId] });
      }
    }
    if (role === "saci") saciActed = true;
  }

  if (saciActed) await roomRef.update({ saciActedThisNight: true });

  if (remainingPending.length === 0) {
    await finalizeNight(roomCode, round);
  } else {
    await roomRef.update({ nightPendingRoles: remainingPending });
  }
}

export { ROLE_SIDE };
