import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

export function requireAuth(req: CallableRequest): string {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Auth obrigatória.");
  return req.auth.uid;
}

export type AnyPlayer = Record<string, unknown> & { id: string; uid: string };

/** Lookup by playerId (localStorage) first, then Firebase Auth uid. */
export function findPlayer(players: AnyPlayer[], req: CallableRequest): AnyPlayer | undefined {
  const pid = String(req.data?.playerId ?? "");
  if (pid) {
    const byId = players.find((p) => p.id === pid && !p.isBot);
    if (byId) return byId;
  }
  const uid = req.auth?.uid;
  if (!uid) return undefined;
  return players.find((p) => p.uid === uid && !p.isBot);
}
