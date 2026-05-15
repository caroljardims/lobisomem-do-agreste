import { FieldValue } from "firebase-admin/firestore";
import { NIGHT_ACTION_ORDER, ROLE_SIDE } from "folclore-game-engine";
import type { RoleId } from "folclore-game-engine";
import { db } from "./lib/db.js";
import { grantObjectiveMvp } from "./lib/playerPrivateScore.js";

export { db } from "./lib/db.js";

export function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const len = 4;
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function loadPlayers(roomCode: string) {
  const snap = await db.collection("rooms").doc(roomCode).collection("players").get();
  /** `id` no payload não pode sobrescrever o id do documento — senão updates/batch apontam para doc errado. */
  return snap.docs.map((d) => ({ ...d.data(), id: d.id })) as Array<
    Record<string, unknown> & { id: string; uid: string; name?: string }
  >;
}

export async function loadSecrets(roomCode: string) {
  const snap = await db.collection("rooms").doc(roomCode).collection("secrets").get();
  const map: Record<string, { role: RoleId; side: import("folclore-game-engine").Side }> = {};
  for (const d of snap.docs) {
    const data = d.data() as { role: RoleId; side: import("folclore-game-engine").Side };
    map[d.id] = data;
  }
  return map;
}

export function nightRolesInPlay(secrets: Record<string, { role: RoleId }>, alive: Set<string>): RoleId[] {
  const inGame = new Set<RoleId>();
  for (const pid of alive) {
    const s = secrets[pid];
    if (s) inGame.add(s.role);
  }
  return NIGHT_ACTION_ORDER.filter((r) => inGame.has(r));
}

export async function startNightSequence(roomCode: string, round: number) {
  const [players, secrets] = await Promise.all([loadPlayers(roomCode), loadSecrets(roomCode)]);
  const alive = new Set(
    players.filter((p) => p.alive !== false && !p.eliminated && !p.expelled).map((p) => p.id),
  );
  const order = nightRolesInPlay(secrets, alive);

  const loboUpdates: Promise<unknown>[] = [];
  if (round === 4) {
    const loboPlayer = players.find((p) => secrets[p.id]?.role === "lobisomem");
    if (loboPlayer && loboPlayer.alive !== false && !loboPlayer.eliminated && !loboPlayer.expelled && !loboPlayer.individualObjectiveMet) {
      const roomRef = db.collection("rooms").doc(roomCode);
      loboUpdates.push(
        roomRef.collection("players").doc(loboPlayer.id).update({ individualObjectiveMet: true }),
        roomRef.update({
          individualWins: FieldValue.arrayUnion({
            playerId: loboPlayer.id,
            role: "lobisomem",
            type: "lobisomem_survived_r4",
            round,
            timestamp: Date.now(),
          }),
        }),
        grantObjectiveMvp(roomCode, loboPlayer.id, round),
      );
    }
  }

  await Promise.all([
    db.collection("rooms").doc(roomCode).update({
      status: "night",
      phase: "night",
      round,
      nightPhaseIndex: 0,
      currentActorRole: null,
      nightOrderRoles: order,
      nightPendingRoles: order,
      nightReadyPlayerIds: [],
    }),
    ...loboUpdates,
  ]);
}

export { ROLE_SIDE };
