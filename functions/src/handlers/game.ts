import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { dealRoles, maxRoundsForPlayerCount } from "folclore-game-engine";
import {
  db,
  loadPlayers,
  randomCode,
  randomId,
  ROLE_SIDE,
  startNightSequence,
} from "../helpers.js";
import { maybeFinalizeNight } from "../lib/finalize.js";
import { processBotNightActions } from "../lib/bots.js";
import { requireAuth } from "./shared.js";

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
      actionUsed: false,
      alignment: FieldValue.delete(),
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
  await maybeFinalizeNight(code, 1);
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
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    batch.set(roomRef.collection("players").doc(botId), {
      id: botId,
      uid: `bot_${botId}`,
      name,
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
      iaraSeductionBlockedThroughRound: FieldValue.delete(),
      isSpokesperson: false,
      actionUsed: false,
      publicReveal: FieldValue.delete(),
      alignment: FieldValue.delete(),
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
