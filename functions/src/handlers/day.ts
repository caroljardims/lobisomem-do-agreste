import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, loadPlayers, loadSecrets } from "../helpers.js";
import { finalizeDay } from "../lib/finalize.js";
import { canBeExpulsionVoteTarget, canSubmitExpulsionVote } from "../lib/playerVote.js";
import { findPlayer, requireAuth } from "./shared.js";
import { buildBotContext, getBotMessage } from "../lib/botChat/index.js";

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

  // Bot reativo: ~35% de chance de um bot responder ao humano
  void (async () => {
    try {
      if (Math.random() > 0.35) return;
      const allPlayers = await loadPlayers(code);
      const secrets = await loadSecrets(code);
      const liveBots = allPlayers.filter(
        (p) => p.isBot && p.alive !== false && !p.eliminated && !p.expelled && !p.silenced,
      );
      if (liveBots.length === 0) return;
      const bot = liveBots[Math.floor(Math.random() * liveBots.length)]!;
      const role = secrets[bot.id]?.role ?? "aldeao";
      const livingRefs = allPlayers
        .filter((p) => p.alive !== false && !p.eliminated && !p.expelled)
        .map((p) => ({
          id: p.id,
          name: String(p.name ?? p.id),
          side: (secrets[p.id]?.side ?? "morador") as "criatura" | "morador" | "neutro",
          isBot: Boolean(p.isBot),
        }));
      let chatHistory: Array<{ playerId: string; name: string; text: string }> = [];
      try {
        const snap = await roomRef.collection("chat").orderBy("createdAt", "desc").limit(30).get();
        chatHistory = snap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>;
          return { playerId: String(x.playerId ?? ""), name: String(x.name ?? ""), text: String(x.text ?? "") };
        }).reverse();
      } catch { /* sem histórico */ }
      const round = Number(roomSnap.data()!.round ?? 1);
      const botoId = allPlayers.find((p) => secrets[p.id]?.role === "boto")?.id ?? null;
      const iaraId = allPlayers.find((p) => secrets[p.id]?.role === "iara")?.id ?? null;
      const padreId = allPlayers.find((p) => secrets[p.id]?.role === "padre")?.id ?? null;
      const ctx = buildBotContext({
        selfPlayerId: bot.id,
        role,
        roundNumber: round,
        messageIndex: 0,
        livingPlayers: livingRefs,
        chatHistory,
        publicLogThisDawn: [],
        botoPlayerId: botoId,
        iaraPlayerId: iaraId,
        padrePlayerId: padreId,
        rng: Math.random,
      });
      const reply = getBotMessage(ctx, Math.random);
      await roomRef.collection("chat").add({
        playerId: bot.id,
        name: bot.name,
        text: reply,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch { /* reação do bot é best-effort */ }
  })();

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
