import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { displayRoleName, validateNightAction, isCreatureRole, geniConversedPlayerIds, normalizeGeniInvestigatedTargets } from "folclore-game-engine";
import type { NightActionInput, RoleId } from "folclore-game-engine";
import { db, loadPlayers, loadSecrets, startNightSequence } from "../helpers.js";
import { maybeFinalizeNight } from "../lib/finalize.js";
import { processBotNightActions } from "../lib/bots.js";
import { setNightSuspicion } from "../lib/playerPrivateScore.js";
import { findPlayer, requireAuth } from "./shared.js";

function sanitizeDelegadoJustification(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return t.length ? t : null;
}

export const submitNightAction = onCall(async (req) => {
  requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const action = String(req.data?.action ?? "");
  const targetId = (req.data?.targetId as string | null) ?? null;
  let specialAction = (req.data?.specialAction as string | null) ?? null;
  const justificationRaw = req.data?.justification;
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

  if (mySecret.role === "delegado") {
    if (action === "jail" && targetId) {
      specialAction = sanitizeDelegadoJustification(
        justificationRaw != null && String(justificationRaw).trim() !== ""
          ? String(justificationRaw)
          : specialAction,
      );
    } else if (action === "pass" || (action === "jail" && !targetId)) {
      specialAction = null;
    }
  }

  const submission: NightActionInput = {
    role: mySecret.role,
    action,
    targetId,
    specialAction,
  };

  const nightActionDoc: NightActionInput & { justification?: string | null } =
    mySecret.role === "delegado" && action === "jail" && targetId && submission.specialAction
      ? { ...submission, justification: submission.specialAction }
      : submission;

  if (mySecret.role === "mae_de_santo" && targetId) {
    const target = players.find((p) => p.id === targetId);
    if (!target || !target.eliminated || target.expelled) {
      throw new HttpsError("invalid-argument", "Mãe de Santo só pode invocar jogadores eliminados (não expulsos).");
    }
  }

  const privSnap = await roomRef.collection("playerPrivate").doc(me.id).get();
  const usedTargets = (privSnap.data()?.investigationTargetsUsed as string[]) ?? [];
  const geniNorm = normalizeGeniInvestigatedTargets(room.geniInvestigatedTargets);
  const priorInvestigationTargetIds =
    mySecret.role === "geni" && action === "converse"
      ? geniConversedPlayerIds(geniNorm)
      : mySecret.role === "cartomante" || mySecret.role === "boitata"
        ? usedTargets
        : [];

  const v = validateNightAction(
    {
      round: Number(room.round ?? 1),
      expectedRole: mySecret.role,
      tablePlayerCount:
        room.gameTablePlayerCount != null ? Number(room.gameTablePlayerCount) : undefined,
      priorInvestigationTargetIds,
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
      delegadoLastJailedId: (me.delegadoLastJailedId as string | null | undefined) ?? null,
      wolfBiteUsed: Boolean(me.wolfBiteUsed),
      mulaExorcizeUsed: Boolean(me.mulaExorcizeUsed),
      geniCharmUsed: Boolean(me.geniCharmUsed),
      catechized: Boolean(me.catechized),
      iaraSeductionBlockedThroughRound:
        me.iaraSeductionBlockedThroughRound == null
          ? null
          : Number(me.iaraSeductionBlockedThroughRound),
    },
    submission,
  );
  if (!v.ok) throw new HttpsError("invalid-argument", v.error);

  const blockedThisNight = Boolean(me.blockedNextNight);

  const round = Number(room.round ?? 1);
  const nightRef = roomRef.collection("nightActions").doc(String(round));
  await nightRef.set(
    {
      [me.id]: nightActionDoc,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  if (
    !blockedThisNight &&
    Number(room.gameTablePlayerCount) !== 5 &&
    (mySecret.role === "curupira" || mySecret.role === "boitata") &&
    round === 1 &&
    (specialAction === "moradores" || specialAction === "criaturas")
  ) {
    const crono = `Alinhamento (1ª noite): ${String(me.name ?? "")} (${displayRoleName(mySecret.role)}, neutro) escolheu ficar com os ${specialAction === "moradores" ? "moradores" : "criaturas"}. Na vitória coletiva, passa a contar nesse lado ao comparar quantos vivos restam de cada time (criaturas + neutros do folclore vs. moradores + neutros da comunidade).`;
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

  if (mySecret.role === "geni" && targetId && action === "converse" && !blockedThisNight) {
    const prevNorm = normalizeGeniInvestigatedTargets(room.geniInvestigatedTargets);
    if (!geniConversedPlayerIds(prevNorm).includes(targetId)) {
      const tr = secrets[targetId]?.role;
      const result: "criatura" | "morador" = tr && isCreatureRole(tr) ? "criatura" : "morador";
      await roomRef.update({
        geniInvestigatedTargets: [...prevNorm, { playerId: targetId, round, result }],
      });
    }
  }

  if (mySecret.role === "geni" && action === "charm" && !blockedThisNight) {
    await roomRef.collection("players").doc(me.id).update({ geniCharmUsed: true });
  }

  if (mySecret.role === "mula" && action === "exorcize" && !blockedThisNight) {
    await roomRef.collection("players").doc(me.id).update({ mulaExorcizeUsed: true });
  }

  if (mySecret.role === "lobisomem" && action === "bite" && !blockedThisNight) {
    await roomRef.collection("players").doc(me.id).update({ wolfBiteUsed: true });
  }

  if (mySecret.role === "iara" && action === "eliminate_special" && !blockedThisNight) {
    await roomRef.collection("players").doc(me.id).update({ iaraSeductionBlockedThroughRound: round + 2 });
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

export const submitNightSuspicion = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const pass = Boolean(req.data?.pass);
  const raw = req.data?.targetId as string | null | undefined;
  const targetId = pass || raw === "" || raw == null ? null : String(raw).trim();
  if (!code) throw new HttpsError("invalid-argument", "Código inválido.");

  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  if (roomSnap.data()!.status !== "night") throw new HttpsError("failed-precondition", "Só de noite.");

  const players = await loadPlayers(code);
  const me = findPlayer(players, req);
  if (!me || me.alive === false || me.eliminated || me.expelled) {
    throw new HttpsError("failed-precondition", "Você não pode enviar suspeita agora.");
  }
  const aliveOthers = players.filter(
    (p) => p.id !== me.id && p.alive !== false && !p.eliminated && !p.expelled,
  );
  if (targetId && !aliveOthers.some((p) => p.id === targetId)) {
    throw new HttpsError("invalid-argument", "Alvo inválido.");
  }
  await setNightSuspicion(code, me.id, uid, targetId);
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
  const { expireSaciGorroIfPending } = await import("../lib/saciGorro.js");
  await expireSaciGorroIfPending(code);
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
