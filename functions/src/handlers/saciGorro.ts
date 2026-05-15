import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { loadPlayers, loadSecrets } from "../helpers.js";
import {
  completeGorroSwap,
  expireSaciGorroIfPending,
  getPendingSaciGorro,
  isGorroExpired,
} from "../lib/saciGorro.js";
import { livingTargetsExcept } from "folclore-game-engine";
import { findPlayer, requireAuth } from "./shared.js";

export const submitSaciGorroChoice = onCall(async (req) => {
  requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  const targetPlayerId = String(req.data?.targetPlayerId ?? "").trim();
  if (!code || !targetPlayerId) throw new HttpsError("invalid-argument", "Parâmetros inválidos.");

  const [players, secrets] = await Promise.all([loadPlayers(code), loadSecrets(code)]);
  const me = findPlayer(players, req);
  if (!me || secrets[me.id]?.role !== "saci") throw new HttpsError("permission-denied", "Apenas Saci.");

  const { db } = await import("../helpers.js");
  const roomRef = db.collection("rooms").doc(code);
  const roomSnap = await roomRef.get();
  const pending = getPendingSaciGorro(roomSnap.data() ?? {});
  if (!pending || pending.saciPlayerId !== me.id) {
    throw new HttpsError("failed-precondition", "Sem oferta ativa.");
  }
  if (isGorroExpired(pending)) {
    throw new HttpsError("failed-precondition", "Tempo esgotado. Aguarde o redemoinho.");
  }
  if (me.actionUsed) throw new HttpsError("failed-precondition", "Gorro já foi usado.");

  const targets = livingTargetsExcept(players, me.id);
  if (!targets.some((t) => t.id === targetPlayerId)) {
    throw new HttpsError("invalid-argument", "Alvo inválido.");
  }

  const ok = await completeGorroSwap(code, targetPlayerId);
  if (!ok) throw new HttpsError("failed-precondition", "Não foi possível completar o Gorro.");
  return { ok: true };
});

export const expireSaciGorro = onCall(async (req) => {
  requireAuth(req);
  const code = String(req.data?.roomCode ?? "").toUpperCase().trim();
  if (!code) throw new HttpsError("invalid-argument", "Código inválido.");

  const ok = await expireSaciGorroIfPending(code);
  return { ok };
});

export const expireSaciGorroTask = onTaskDispatched(
  {
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 10 },
    rateLimits: { maxConcurrentDispatches: 20 },
  },
  async (req) => {
    const roomCode = String(req.data?.roomCode ?? "").toUpperCase().trim();
    const round = req.data?.round != null ? Number(req.data.round) : undefined;
    if (!roomCode) return;
    await expireSaciGorroIfPending(roomCode, round);
  },
);
