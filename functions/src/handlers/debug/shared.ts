import { HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import { db } from "../../lib/db.js";
import { requireAuth } from "../shared.js";

const LOCAL_HOST_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i;

export function assertLocalDebugRequest(req: CallableRequest): void {
  if (process.env.FUNCTIONS_EMULATOR === "true") return;

  const origin = req.rawRequest?.headers?.origin;
  const referer = req.rawRequest?.headers?.referer;
  const raw = String(Array.isArray(origin) ? origin[0] : origin ?? referer ?? "");
  const firstLine = raw.split(/\s/)[0] ?? raw;
  if (!firstLine || !LOCAL_HOST_REGEX.test(firstLine.trim())) {
    throw new HttpsError(
      "permission-denied",
      "Debug apenas a partir de localhost (Origin/Referer não autorizado).",
    );
  }
}

/** Returns authenticated uid after verifying debug room host. */
export async function assertDebugHost(req: CallableRequest, roomCode: string): Promise<string> {
  const uid = requireAuth(req);
  const code = roomCode.toUpperCase().trim();
  if (!code) throw new HttpsError("invalid-argument", "Código inválido.");
  const snap = await db.collection("rooms").doc(code).get();
  if (!snap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  const room = snap.data() ?? {};
  if (room.debug !== true) throw new HttpsError("failed-precondition", "Não é sala debug.");
  if (room.hostUid !== uid) throw new HttpsError("permission-denied", "Apenas o anfitrião.");
  return uid;
}
