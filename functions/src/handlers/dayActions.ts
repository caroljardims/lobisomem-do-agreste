import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  checkCollectiveWinDetailed,
  collectiveWinChronicleMessagePt,
  displayRoleName,
  isCreatureRole,
  type WinPlayerSnapshot,
} from "folclore-game-engine";
import type { RoleId } from "folclore-game-engine";
import { db, loadPlayers, loadSecrets, ROLE_SIDE, startNightSequence } from "../helpers.js";
import { processBotNightActions } from "../lib/bots.js";
import { maybeFinalizeNight } from "../lib/finalize.js";
import { finalizeMvpLedgerIfNeeded } from "../lib/endGameScoring.js";
import { grantAldeaoObjectiveIfMoradoresWon, grantObjectiveMvp } from "../lib/playerPrivateScore.js";
import { findPlayer, requireAuth } from "./shared.js";

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
    const round = Number(roomSnap.data()!.round ?? 1);
    await Promise.all([
      roomRef.update({
        status: "ended",
        phase: "ended",
        winner: me.id,
        pendingBrasChoice: false,
        revealedRoles,
        individualWins: FieldValue.arrayUnion({
          playerId: me.id,
          role: "bras_cubas",
          type: "bras_tolo_encerra",
          round,
          timestamp: Date.now(),
        }),
      }),
      roomRef.collection("players").doc(me.id).update({ individualObjectiveMet: true }),
    ]);
    await finalizeMvpLedgerIfNeeded(code).catch(console.error);
  } else {
    const validRoles = Object.keys(ROLE_SIDE) as RoleId[];
    const resolvedRole = (chosenRole && validRoles.includes(chosenRole as RoleId))
      ? (chosenRole as RoleId)
      : "aldeao";
    await roomRef.collection("secrets").doc(me.id).update({ role: resolvedRole, side: ROLE_SIDE[resolvedRole] });
    await roomRef.collection("players").doc(me.id).update({
      alive: true,
      expelled: false,
      mulaExorcizeUsed: false,
      geniCharmUsed: false,
      wolfBiteUsed: false,
      iaraSeductionBlockedThroughRound: FieldValue.delete(),
      individualObjectiveMet: false,
      actionUsed: false,
      publicReveal: FieldValue.delete(),
    });
    await roomRef.update({ pendingBrasChoice: false, votingOpen: false });
    const r = Number(roomSnap.data()!.round ?? 1) + 1;
    await roomRef.collection("playerPrivate").doc(me.id).set({ bdObjective: 0 }, { merge: true });
    await startNightSequence(code, r);
    await processBotNightActions(code, r);
    await maybeFinalizeNight(code, r);
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

  const [secrets, players] = await Promise.all([loadSecrets(code), loadPlayers(code)]);
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
    const round = Number(room.round ?? 1);
    const roomPatch: Record<string, unknown> = { daySubPhase: "idle", coronelVotesYes: {} };
    if (coronelPlayer) {
      roomPatch.individualWins = FieldValue.arrayUnion({
        playerId: coronelPlayer.id,
        role: "coronel",
        type: "coronel_acusacao_boitata",
        round,
        timestamp: Date.now(),
      });
    }
    b.update(roomRef, roomPatch);
    await b.commit();
    if (coronelPlayer) {
      await grantObjectiveMvp(code, coronelPlayer.id, round).catch(console.error);
    }
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
  const stage = String(req.data?.stage ?? "commit") === "preview" ? "preview" : "commit";
  const targetIdRaw = String(req.data?.targetId ?? "").trim();
  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  const room = roomSnap.data()!;
  if (room.status !== "day") throw new HttpsError("failed-precondition", "Só de dia.");

  const [players, secrets] = await Promise.all([loadPlayers(code), loadSecrets(code)]);
  const me = findPlayer(players, req);
  if (!me || secrets[me.id]?.role !== "cangaceiro") throw new HttpsError("permission-denied", "Apenas Cangaceiro.");
  if (me.alive === false || me.eliminated || me.expelled) {
    throw new HttpsError("failed-precondition", "Você não pode usar o Tiro Certo.");
  }
  if (me.actionUsed) throw new HttpsError("failed-precondition", "Tiro Certo já foi usado nesta partida.");

  if (!targetIdRaw) throw new HttpsError("invalid-argument", "Escolha um alvo.");

  const round = Number(room.round ?? 1);
  const target = players.find((p) => p.id === targetIdRaw);
  if (!target || target.id === me.id) throw new HttpsError("invalid-argument", "Alvo inválido.");
  if (target.alive === false || target.eliminated || target.expelled) {
    throw new HttpsError("invalid-argument", "Alvo inválido.");
  }

  const history = (room.geniInvestigatedTargets as string[]) ?? [];
  const geniPid = players.find((p) => secrets[p.id]?.role === "geni")?.id;
  const consulted = Boolean(geniPid && history.includes(targetIdRaw));
  const targetRole = secrets[targetIdRaw]?.role;
  if (!targetRole) throw new HttpsError("invalid-argument", "Alvo inválido.");

  const creature = isCreatureRole(targetRole);

  if (stage === "preview") {
    if (!consulted) return { consulted: false as const };
    const hint = creature ? ("criatura" as const) : ("morador" as const);
    return { consulted: true as const, hint };
  }

  const batch = db.batch();
  const meRef = roomRef.collection("players").doc(me.id);
  batch.update(roomRef.collection("players").doc(targetIdRaw), { alive: false, eliminated: true });

  if (creature) {
    batch.update(meRef, { actionUsed: true });
    if (targetRole === "iara") {
      batch.update(roomRef, {
        individualWins: FieldValue.arrayUnion({
          playerId: me.id,
          role: "cangaceiro",
          type: "cangaceiro_iara",
          round,
          timestamp: Date.now(),
        }),
      });
    }
  } else {
    batch.update(meRef, { actionUsed: true, publicReveal: "cangaceiro" });
    const logRef = roomRef.collection("publicLogEntries").doc();
    batch.set(logRef, {
      round,
      type: "special",
      message: `O Cangaceiro errou o tiro. ${me.name} revela-se como Cangaceiro; ${displayRoleName(targetRole)} foi eliminado por engano.`,
      timestamp: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();

  if (creature && targetRole === "iara") {
    await grantObjectiveMvp(code, me.id, round).catch(console.error);
  }

  const [snaps2, sec2] = await Promise.all([loadPlayers(code), loadSecrets(code)]);
  const winPlayers: Record<string, WinPlayerSnapshot> = {};
  for (const p of snaps2) {
    const r = sec2[p.id]?.role;
    if (!r) continue;
    winPlayers[p.id] = {
      id: p.id,
      role: r,
      alive: p.alive !== false,
      eliminated: Boolean(p.eliminated),
      expelled: Boolean(p.expelled),
      individualObjectiveMet: Boolean(p.individualObjectiveMet),
      alignment:
        p.alignment === "moradores" || p.alignment === "criaturas" ? p.alignment : null,
    };
  }
  const winDetail = checkCollectiveWinDetailed(winPlayers, round, Number(room.maxRounds ?? 7), Number(room.gameTablePlayerCount ?? 0) || snaps2.length);
  const w = winDetail.winner;
  if (w) {
    const revealedRoles: Record<string, string> = {};
    for (const p of snaps2) {
      const r = sec2[p.id]?.role;
      if (r) revealedRoles[p.id] = r;
    }
    const endMsg = collectiveWinChronicleMessagePt(winDetail);
    const ts = Date.now();
    const extraWins: Array<{ playerId: string; role: RoleId; type: string; round: number; timestamp: number }> = [];
    if (Number(room.gameTablePlayerCount) === 5) {
      for (const p of snaps2) {
        const role = sec2[p.id]?.role;
        if (role !== "curupira" && role !== "boitata") continue;
        const alive = p.alive !== false && !p.eliminated && !p.expelled;
        if (alive && p.individualObjectiveMet) {
          extraWins.push({
            playerId: p.id,
            role,
            type: role === "curupira" ? "curupira_cinco_objetivo" : "boitata_cinco_objetivo",
            round,
            timestamp: ts,
          });
        }
      }
    }
    const bEnd = db.batch();
    const endPatch: Record<string, unknown> = {
      status: "ended",
      phase: "ended",
      winner: w,
      votingOpen: false,
      revealedRoles,
      ...(winDetail.reason === "moradores_plaza_tie"
        ? { collectiveEndKind: "moradores_plaza_tie" }
        : { collectiveEndKind: FieldValue.delete() }),
    };
    if (extraWins.length > 0) {
      endPatch.individualWins = FieldValue.arrayUnion(...extraWins);
    }
    bEnd.update(roomRef, endPatch);
    if (endMsg) {
      bEnd.set(roomRef.collection("publicLogEntries").doc(), {
        round,
        type: "chronicle_end",
        message: endMsg,
        timestamp: Date.now(),
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    await bEnd.commit();
    if (w === "moradores") {
      await grantAldeaoObjectiveIfMoradoresWon(code, round, w, snaps2, sec2).catch(console.error);
    }
    await finalizeMvpLedgerIfNeeded(code).catch(console.error);
  }

  return { hit: creature, consulted, ended: Boolean(w) };
});

