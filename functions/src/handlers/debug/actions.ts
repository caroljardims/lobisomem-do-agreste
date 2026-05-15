import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { NightActionInput, RoleId } from "folclore-game-engine";
import { db, loadPlayers, loadSecrets, startNightSequence } from "../../helpers.js";
import { finalizeDay, maybeFinalizeNight } from "../../lib/finalize.js";
import { processBotNightActions } from "../../lib/bots.js";
import { canBeExpulsionVoteTarget, canSubmitExpulsionVote } from "../../lib/playerVote.js";
import { assertDebugHost, assertLocalDebugRequest } from "./shared.js";
import { resolveDebugNightFully } from "./nightAdvance.js";

async function unifyVotesAgainst(roomCode: string, targetPlayerId: string): Promise<void> {
  const roomRef = db.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  const room = roomSnap.data();
  if (!room) throw new HttpsError("not-found", "Sala não encontrada.");

  const round = Number(room.votesRound ?? room.round ?? 1);
  const players = await loadPlayers(roomCode);

  const target = players.find((p) => p.id === targetPlayerId);
  if (
    !target ||
    target.id !== targetPlayerId ||
    target.alive === false ||
    Boolean(target.eliminated) ||
    Boolean(target.expelled) ||
    !canBeExpulsionVoteTarget(target)
  ) {
    throw new HttpsError("invalid-argument", "Alvo de expulsão inválido.");
  }

  const patch: Record<string, string | null> = {};
  for (const p of players) {
    if (!canSubmitExpulsionVote(p)) continue;
    if (p.id === targetPlayerId) continue;
    patch[p.id] = targetPlayerId;
  }

  await roomRef.collection("votes").doc(String(round)).set(
    { ...patch, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

async function fillMissingDayVotes(roomCode: string): Promise<void> {
  const roomRef = db.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  const room = roomSnap.data() ?? {};
  if (room.status !== "day" || room.votingOpen !== true) return;

  const round = Number(room.votesRound ?? room.round ?? 1);
  const [players, voteSnap] = await Promise.all([
    loadPlayers(roomCode),
    roomRef.collection("votes").doc(String(round)).get(),
  ]);

  const raw = voteSnap.data() ?? {};
  const picks: Record<string, string | null> = {};

  const aliveEligible = players.filter(
    (p) =>
      p.alive !== false &&
      !p.eliminated &&
      !p.expelled &&
      canSubmitExpulsionVote(p),
  );
  const votingTargets = players.filter((p) => canBeExpulsionVoteTarget(p));
  let changed = false;

  const debugTargets =
    room.debugBotVoteTargets && typeof room.debugBotVoteTargets === "object"
      ? (room.debugBotVoteTargets as Record<string, string>)
      : {};

  for (const p of aliveEligible) {
    const prev = raw[p.id] as string | null | undefined;
    if (prev !== undefined && prev !== "") continue;

    changed = true;

    let choice: string | null = null;
    const forced = debugTargets[p.id];
    const others = votingTargets.filter((t) => t.id !== p.id);
    const poolForced =
      forced && others.some((t) => t.id === forced) ? forced : null;
    choice =
      others.length === 0
        ? null
        : poolForced
          ? poolForced!
          : others[Math.floor(Math.random() * others.length)]!.id;
    picks[p.id] = choice;
  }

  if (!changed || Object.keys(picks).length === 0) return;

  await roomRef.collection("votes").doc(String(round)).set(
    { ...picks, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

export const debugAdvancePhase = onCall(async (req) => {
  assertLocalDebugRequest(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  await assertDebugHost(req, code);

  const roomRef = db.collection("rooms").doc(code);
  const snap = await roomRef.get();
  const room = snap.data() ?? {};

  if (room.status === "night") {
    await resolveDebugNightFully(code);
    return { phase: "day" };
  }

  if (room.status === "day" && room.votingOpen) {
    await fillMissingDayVotes(code);
    const round = Number(room.votesRound ?? room.round ?? 1);
    await finalizeDay(code, round);

    const after = await roomRef.get();
    return { phase: String(after.data()?.status ?? "day") };
  }

  if (room.status === "day" && room.pendingNightStart) {
    const nextRound = Number(room.pendingNightRound ?? (Number(room.round ?? 1) + 1));
    await roomRef.update({ pendingNightStart: false, pendingNightRound: null });
    await startNightSequence(code, nextRound);
    await processBotNightActions(code, nextRound);
    await maybeFinalizeNight(code, nextRound);
    return { phase: "night" };
  }

  throw new HttpsError("failed-precondition", "Fase atual não permite avanço debug.");
});

export const debugKillPlayer = onCall(async (req) => {
  assertLocalDebugRequest(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  await assertDebugHost(req, code);
  const pid = String(req.data?.targetPlayerId ?? "");
  if (!pid) throw new HttpsError("invalid-argument", "Alvo inválido.");

  const roomRef = db.collection("rooms").doc(code);
  await roomRef.collection("players").doc(pid).update({
    alive: false,
    eliminated: true,
  });
  return { ok: true };
});

export const debugExpelPlayer = onCall(async (req) => {
  assertLocalDebugRequest(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  await assertDebugHost(req, code);
  const pid = String(req.data?.targetPlayerId ?? "");
  if (!pid) throw new HttpsError("invalid-argument", "Alvo inválido.");

  await unifyVotesAgainst(code, pid);
  const roomRef = db.collection("rooms").doc(code);
  const rs = await roomRef.get();
  const round = Number(rs.data()?.votesRound ?? rs.data()?.round ?? 1);
  await finalizeDay(code, round);
  return { ok: true };
});

export const debugForceWin = onCall(async (req) => {
  assertLocalDebugRequest(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  await assertDebugHost(req, code);
  const side = String(req.data?.winner ?? "");

  const roomRef = db.collection("rooms").doc(code);
  const players = await loadPlayers(code);
  const secrets = await loadSecrets(code);
  let winner: string;
  switch (side) {
    case "moradores":
      winner = "moradores";
      break;
    case "criaturas":
      winner = "criaturas";
      break;
    case "individual_objectives":
    case "criaturas_objs":
      winner = "criaturas";
      break;
    default:
      throw new HttpsError("invalid-argument", "winner deve ser moradores | criaturas | individual_objectives.");
  }

  const revealedRoles: Record<string, string> = {};
  for (const p of players) {
    const r = secrets[p.id]?.role;
    if (r) revealedRoles[p.id] = r;
  }

  await roomRef.update({
    status: "ended",
    phase: "ended",
    winner,
    votingOpen: false,
    revealedRoles,
    pendingNightStart: false,
    pendingNightRound: null,
    pendingBrasChoice: false,
    pendingSaciGorro: null,
    mvpLedgerApplied: false,
  });
  return { ok: true };
});

export const debugResetRound = onCall(async (req) => {
  assertLocalDebugRequest(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  await assertDebugHost(req, code);

  const roomRef = db.collection("rooms").doc(code);
  const snap = await roomRef.get();
  const round = Number(snap.data()?.round ?? 1);

  await roomRef.collection("votes").doc(String(round)).delete().catch(() => {});
  await roomRef.collection("nightActions").doc(String(round)).delete().catch(() => {});

  await startNightSequence(code, round);
  return { ok: true };
});

export const debugGetPrivateLog = onCall(async (req) => {
  assertLocalDebugRequest(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  await assertDebugHost(req, code);

  const playerId = String(req.data?.playerId ?? "");
  if (!playerId) throw new HttpsError("invalid-argument", "playerId inválido.");

  const refs = db
    .collection("rooms")
    .doc(code)
    .collection("privateLog")
    .doc(playerId)
    .collection("entries");

  const q = await refs.orderBy("timestamp", "desc").limit(120).get();
  return {
    entries: q.docs.map((d) => ({ id: d.id, ...(d.data() as object) })),
  };
});

export const debugSetNightAction = onCall(async (req) => {
  assertLocalDebugRequest(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  await assertDebugHost(req, code);

  const playerId = String(req.data?.playerId ?? "");
  const role = req.data?.role as RoleId;
  const action = String(req.data?.action ?? "");
  const targetId = (req.data?.targetId as string | null) ?? null;
  const specialAction = (req.data?.specialAction as string | null) ?? null;

  if (!playerId || !role) throw new HttpsError("invalid-argument", "Parâmetros inválidos.");

  const roomRef = db.collection("rooms").doc(code);
  const rs = await roomRef.get();
  const room = rs.data() ?? {};
  if (room.status !== "night") throw new HttpsError("failed-precondition", "Precisa estar de noite.");

  const submission: NightActionInput = {
    role,
    action,
    targetId,
    specialAction,
  };

  const round = Number(room.round ?? 1);
  await roomRef.collection("nightActions").doc(String(round)).set(
    {
      [playerId]: submission,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const pending = ((room.nightPendingRoles as RoleId[]) ?? []).filter((r) => r !== role);
  await roomRef.update({
    nightPendingRoles: pending,
    nightReadyPlayerIds: FieldValue.arrayUnion(playerId),
  });

  await processBotNightActions(code, round);
  await maybeFinalizeNight(code, round);
  return { ok: true };
});
