import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFunctions } from "firebase-admin/functions";
import {
  displayRoleName,
  livingTargetsExcept,
  pickRandomGorroTarget,
} from "folclore-game-engine";
import { db } from "./db.js";
import { loadPlayers, loadSecrets } from "../helpers.js";
import { finalizeMvpLedgerIfNeeded } from "./endGameScoring.js";
import { grantObjectiveMvp } from "./playerPrivateScore.js";
import { scoreBrasRoundTease, scoreMvpVotesAfterDay } from "./mvpDawnAndVoteScoring.js";

type LoadedPlayer = Awaited<ReturnType<typeof loadPlayers>>[number];
type SecretsMap = Awaited<ReturnType<typeof loadSecrets>>;

export type PendingSaciGorro = {
  saciPlayerId: string;
  expiresAt: Timestamp;
  round: number;
};

const GORRO_MS = 60_000;

function pendingFromRoom(room: Record<string, unknown>): PendingSaciGorro | null {
  const raw = room.pendingSaciGorro;
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.saciPlayerId !== "string") return null;
  const expiresAt = p.expiresAt as Timestamp | undefined;
  if (!expiresAt) return null;
  return {
    saciPlayerId: p.saciPlayerId,
    expiresAt,
    round: Number(p.round ?? 0),
  };
}

function expiresAtMs(pending: PendingSaciGorro): number {
  if (pending.expiresAt instanceof Timestamp) return pending.expiresAt.toMillis();
  return Number(pending.expiresAt);
}

async function appendPrivateLog(
  roomRef: FirebaseFirestore.DocumentReference,
  playerId: string,
  round: number,
  message: string,
): Promise<void> {
  await roomRef.collection("privateLog").doc(playerId).collection("entries").add({
    round,
    message,
    timestamp: Date.now(),
    createdAt: FieldValue.serverTimestamp(),
  });
}

/** Post-expulsion tail shared by normal finalizeDay and Gorro completion. */
export async function runPostExpulsionTail(
  roomCode: string,
  round: number,
  expelledId: string,
  voteRecord: Record<string, string | null | undefined>,
  brasId: string | null,
): Promise<void> {
  const roomRef = db.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  const room = roomSnap.data() ?? {};

  const [players, secrets] = await Promise.all([loadPlayers(roomCode), loadSecrets(roomCode)]);

  await scoreMvpVotesAfterDay(roomCode, round, voteRecord, expelledId, players, secrets).catch(console.error);
  await scoreBrasRoundTease(roomCode, round, voteRecord, brasId, expelledId).catch(console.error);

  if (secrets[expelledId]?.role === "bras_cubas") {
    await grantObjectiveMvp(roomCode, expelledId, round).catch(console.error);
  }
  if (secrets[expelledId]?.role === "padre") {
    const mulaP = players.find((p) => secrets[p.id]?.role === "mula");
    if (mulaP) await grantObjectiveMvp(roomCode, mulaP.id, round).catch(console.error);
  }

  if (secrets[expelledId]?.role === "bras_cubas") {
    const brasPlayer = players.find((p) => p.id === expelledId);
    if (brasPlayer?.isBot) {
      const revealedRoles: Record<string, string> = {};
      for (const p of players) {
        const r = secrets[p.id]?.role;
        if (r) revealedRoles[p.id] = r;
      }
      await Promise.all([
        roomRef.update({
          status: "ended",
          phase: "ended",
          winner: brasPlayer.id,
          pendingBrasChoice: false,
          votingOpen: false,
          revealedRoles,
          individualWins: FieldValue.arrayUnion({
            playerId: brasPlayer.id,
            role: "bras_cubas",
            type: "bras_tolo_encerra",
            round,
            timestamp: Date.now(),
          }),
        }),
        roomRef.collection("players").doc(brasPlayer.id).update({ individualObjectiveMet: true }),
      ]);
      await finalizeMvpLedgerIfNeeded(roomCode).catch(console.error);
      return;
    }
    return;
  }

  const { tryEndGameCollective } = await import("./finalize.js");
  if (await tryEndGameCollective(roomCode, round, room)) {
    return;
  }

  const nextRound = round + 1;
  await roomRef.update({ pendingNightStart: true, pendingNightRound: nextRound });
}

async function processGorroExpulsion(
  roomCode: string,
  round: number,
  targetPlayerId: string,
  saciId: string,
  players: LoadedPlayer[],
  secrets: SecretsMap,
): Promise<void> {
  const roomRef = db.collection("rooms").doc(roomCode);
  const target = players.find((p) => p.id === targetPlayerId)!;
  const role = secrets[targetPlayerId]!.role;

  const batch = db.batch();
  batch.update(roomRef.collection("players").doc(targetPlayerId), { alive: false, expelled: true });

  const msg =
    role === "bras_cubas"
      ? `Espera. ${target.name} sorri. Era o Tolo — e ser expulso era exatamente o que queria.`
      : `${target.name} é expulso(a) da cidade. Era ${displayRoleName(role)}.`;

  batch.set(roomRef.collection("publicLogEntries").doc(), {
    round,
    type: role === "bras_cubas" ? "special" : "expulsion",
    message: msg,
    timestamp: Date.now(),
    createdAt: FieldValue.serverTimestamp(),
  });

  const roomBatchUpdate: Record<string, unknown> = {
    votingOpen: false,
    ...(role === "bras_cubas" ? { pendingBrasChoice: true } : {}),
  };

  if (role === "padre") {
    const mulaPlayer = players.find((p) => secrets[p.id]?.role === "mula");
    if (mulaPlayer && !mulaPlayer.individualObjectiveMet) {
      batch.update(roomRef.collection("players").doc(mulaPlayer.id), { individualObjectiveMet: true });
      roomBatchUpdate.individualWins = FieldValue.arrayUnion({
        playerId: mulaPlayer.id,
        role: "mula",
        type: "mula_padre",
        round,
        timestamp: Date.now(),
      });
    }
  }

  batch.update(roomRef, roomBatchUpdate);
  await batch.commit();

  await appendPrivateLog(
    roomRef,
    saciId,
    round,
    `O redemoinho fez seu trabalho. ${target.name} foi no seu lugar. Ninguém vai saber.`,
  );
  await appendPrivateLog(
    roomRef,
    targetPlayerId,
    round,
    "Você foi expulso por um redemoinho — não pela cidade. O Saci Pererê trocou de lugar com você no momento da expulsão. Só você sabe disso agora.",
  );
}

async function enqueueExpireTask(roomCode: string, round: number): Promise<void> {
  try {
    const queue = getFunctions().taskQueue("expireSaciGorroTask");
    await queue.enqueue({ roomCode, round }, { scheduleDelaySeconds: 60 });
  } catch (err) {
    console.error("expireSaciGorroTask enqueue failed", err);
  }
}

export async function beginSaciGorroOffer(
  roomCode: string,
  round: number,
  saciId: string,
  players: LoadedPlayer[],
): Promise<void> {
  const roomRef = db.collection("rooms").doc(roomCode);
  const expiresAt = Timestamp.fromMillis(Date.now() + GORRO_MS);
  const pending: PendingSaciGorro = { saciPlayerId: saciId, expiresAt, round };

  const batch = db.batch();
  batch.update(roomRef, {
    pendingSaciGorro: pending,
    votingOpen: false,
  });
  const saciLogRef = roomRef.collection("privateLog").doc(saciId).collection("entries").doc();
  batch.set(saciLogRef, {
    round,
    message:
      "A cidade votou pela sua expulsão — mas o Gorro Vermelho é seu. Escolha quem vai no seu lugar. Você tem 60 segundos.",
    timestamp: Date.now(),
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  const targets = livingTargetsExcept(players, saciId);
  if (targets.length === 1) {
    await completeGorroSwap(roomCode, targets[0]!.id);
    return;
  }
  if (targets.length === 0) {
    await roomRef.update({ pendingSaciGorro: FieldValue.delete() });
    return;
  }

  await enqueueExpireTask(roomCode, round);
}

/**
 * Completes Gorro swap: Saci stays, substitute expelled.
 * Idempotent if pending already cleared.
 */
export async function completeGorroSwap(roomCode: string, targetPlayerId: string): Promise<boolean> {
  const roomRef = db.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  const room = roomSnap.data() ?? {};
  const pending = pendingFromRoom(room);
  if (!pending) return false;

  const round = pending.round;
  const saciId = pending.saciPlayerId;

  const [players, secrets] = await Promise.all([loadPlayers(roomCode), loadSecrets(roomCode)]);
  const saci = players.find((p) => p.id === saciId);
  if (!saci || secrets[saciId]?.role !== "saci") {
    await roomRef.update({ pendingSaciGorro: FieldValue.delete() });
    return false;
  }
  if (saci.actionUsed) {
    await roomRef.update({ pendingSaciGorro: FieldValue.delete() });
    return false;
  }

  const targets = livingTargetsExcept(players, saciId);
  const target = players.find((p) => p.id === targetPlayerId);
  if (!target || !targets.some((t) => t.id === targetPlayerId)) {
    return false;
  }

  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(roomRef);
    const p = pendingFromRoom(snap.data() ?? {});
    if (!p || p.saciPlayerId !== saciId) return false;
    tx.update(roomRef, { pendingSaciGorro: FieldValue.delete() });
    tx.update(roomRef.collection("players").doc(saciId), { actionUsed: true });
    return true;
  });

  if (!claimed) return false;

  await processGorroExpulsion(roomCode, round, targetPlayerId, saciId, players, secrets);

  const voteSnap = await roomRef.collection("votes").doc(String(round)).get();
  const votesRaw = voteSnap.data() ?? {};
  const voteRecord: Record<string, string | null | undefined> = {};
  for (const [k, v] of Object.entries(votesRaw)) {
    if (k === "updatedAt") continue;
    voteRecord[k] = v == null || v === "" ? null : String(v);
  }
  const brasId = players.find((p) => secrets[p.id]?.role === "bras_cubas")?.id ?? null;

  await runPostExpulsionTail(roomCode, round, targetPlayerId, voteRecord, brasId);
  return true;
}

export async function expireSaciGorroIfPending(roomCode: string, round?: number): Promise<boolean> {
  const roomRef = db.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  const room = roomSnap.data() ?? {};
  const pending = pendingFromRoom(room);
  if (!pending) return false;
  if (round != null && pending.round !== round) return false;

  if (Date.now() < expiresAtMs(pending)) return false;

  const [players] = await Promise.all([loadPlayers(roomCode)]);
  const targets = livingTargetsExcept(players, pending.saciPlayerId);
  const picked = pickRandomGorroTarget(targets);
  if (!picked) {
    await roomRef.update({ pendingSaciGorro: FieldValue.delete() });
    return false;
  }

  return completeGorroSwap(roomCode, picked);
}

export function getPendingSaciGorro(room: Record<string, unknown>): PendingSaciGorro | null {
  return pendingFromRoom(room);
}

export function isGorroExpired(pending: PendingSaciGorro): boolean {
  return Date.now() >= expiresAtMs(pending);
}
