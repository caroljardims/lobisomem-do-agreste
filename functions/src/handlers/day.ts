import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, loadPlayers } from "../helpers.js";
import { finalizeDay } from "../lib/finalize.js";
import { canBeExpulsionVoteTarget, canSubmitExpulsionVote } from "../lib/playerVote.js";
import { findPlayer, requireAuth } from "./shared.js";

export const submitVote = onCall(async (req) => {
  requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const targetId = (req.data?.targetId as string | null) ?? null;
  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  const room = roomSnap.data()!;
  if (room.status !== "day") throw new HttpsError("failed-precondition", "Não é fase do dia.");

  const voteRound = Number(room.votesRound ?? room.round ?? 1);
  if (Number(room.voidedDayExpulsionRound) === voteRound) {
    throw new HttpsError(
      "failed-precondition",
      "Os votos de expulsão deste dia não valem — a acusação formal do Coronel já foi usada.",
    );
  }

  const players = await loadPlayers(code);
  const me = findPlayer(players, req);
  if (!me) throw new HttpsError("permission-denied", "Jogador não encontrado.");
  if (!canSubmitExpulsionVote(me)) throw new HttpsError("failed-precondition", "Sem direito a voto.");

  if (targetId) {
    const target = players.find((p) => p.id === targetId);
    if (!target || target.id === me.id || !canBeExpulsionVoteTarget(target)) {
      throw new HttpsError("invalid-argument", "Alvo de voto inválido.");
    }
  }

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
