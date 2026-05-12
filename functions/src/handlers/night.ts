import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { displayRoleName, validateNightAction } from "folclore-game-engine";
import type { NightActionInput, RoleId } from "folclore-game-engine";
import { db, loadPlayers, loadSecrets, startNightSequence } from "../helpers.js";
import { maybeFinalizeNight } from "../lib/finalize.js";
import { processBotNightActions } from "../lib/bots.js";
import { findPlayer, requireAuth } from "./shared.js";

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

  const [players, secrets] = await Promise.all([loadPlayers(code), loadSecrets(code)]);
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

  if (
    (mySecret.role === "curupira" || mySecret.role === "boitata") &&
    round === 1 &&
    (specialAction === "moradores" || specialAction === "criaturas")
  ) {
    const crono = `A crônica registra: ${String(me.name ?? "")} (${displayRoleName(mySecret.role)}) — neutro — alinhamento escolhido: ${specialAction}.`;
    const chronicleBatch = db.batch();
    chronicleBatch.update(roomRef.collection("players").doc(me.id), { alignment: specialAction });
    chronicleBatch.set(roomRef.collection("publicLogEntries").doc(), {
      round,
      type: "special",
      message: crono,
      timestamp: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    });
    await chronicleBatch.commit();
  }

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
  await roomRef.update({
    nightPendingRoles: newPending,
    nightReadyPlayerIds: FieldValue.arrayUnion(me.id),
  });
  await processBotNightActions(code, round);
  const dawn = await maybeFinalizeNight(code, round);
  return { advanced: true, dawn };
});

export const markNightReady = onCall(async (req) => {
  requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  if (!code) throw new HttpsError("invalid-argument", "Código inválido.");

  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  const room = roomSnap.data()!;
  if (room.status !== "night") throw new HttpsError("failed-precondition", "Não é fase da noite.");

  const [players, secrets] = await Promise.all([loadPlayers(code), loadSecrets(code)]);
  const me = findPlayer(players, req);
  if (!me) throw new HttpsError("permission-denied", "Você não está nesta sala.");
  if (me.alive === false || me.eliminated || me.expelled) {
    throw new HttpsError("failed-precondition", "Jogador fora da rodada.");
  }
  const mySecret = secrets[me.id];
  if (!mySecret) throw new HttpsError("failed-precondition", "Segredo ausente.");

  const pendingRoles = new Set<RoleId>((room.nightPendingRoles as RoleId[]) ?? []);
  if (pendingRoles.has(mySecret.role)) {
    throw new HttpsError("failed-precondition", "Seu personagem ainda precisa agir na noite.");
  }

  const round = Number(room.round ?? 1);
  await roomRef.update({ nightReadyPlayerIds: FieldValue.arrayUnion(me.id) });
  await processBotNightActions(code, round);
  const dawn = await maybeFinalizeNight(code, round);
  return { ok: true, dawn };
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
  await maybeFinalizeNight(code, nextRound);
  return { ok: true };
});

/** Consulta noturna opcional do Cangaceiro (não bloqueia a fila da noite; não gasta Tiro Certo). */
export const submitCangaceiroConsult = onCall(async (req) => {
  requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const pass = Boolean(req.data?.pass);
  const targetId = ((req.data?.targetId as string | null) ?? null)?.trim() || null;
  if (!code) throw new HttpsError("invalid-argument", "Código inválido.");

  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  const room = roomSnap.data()!;
  if (room.status !== "night") throw new HttpsError("failed-precondition", "Só durante a noite.");

  const [players, secrets] = await Promise.all([loadPlayers(code), loadSecrets(code)]);
  const me = findPlayer(players, req);
  if (!me) throw new HttpsError("permission-denied", "Você não está nesta sala.");
  if (me.alive === false || me.eliminated || me.expelled) {
    throw new HttpsError("failed-precondition", "Jogador fora da rodada.");
  }
  if (secrets[me.id]?.role !== "cangaceiro") throw new HttpsError("permission-denied", "Apenas Cangaceiro.");

  const round = Number(room.round ?? 1);
  const nightRef = roomRef.collection("nightActions").doc(String(round));

  if (pass) {
    const submission: NightActionInput = {
      role: "cangaceiro",
      action: "pass",
      targetId: null,
      specialAction: null,
    };
    await nightRef.set(
      { [me.id]: submission, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return { ok: true, pass: true };
  }

  if (!targetId) throw new HttpsError("invalid-argument", "Escolha um jogador ou passe.");

  const target = players.find((p) => p.id === targetId);
  if (!target || target.id === me.id) throw new HttpsError("invalid-argument", "Alvo inválido.");
  if (target.alive === false || target.eliminated || target.expelled) {
    throw new HttpsError("invalid-argument", "Alvo inválido.");
  }

  const submission: NightActionInput = {
    role: "cangaceiro",
    action: "query",
    targetId,
    specialAction: null,
  };
  await nightRef.set(
    { [me.id]: submission, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return { ok: true, pass: false };
});
