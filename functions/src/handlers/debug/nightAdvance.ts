import { FieldValue } from "firebase-admin/firestore";
import { db } from "../../lib/db.js";
import { loadPlayers } from "../../helpers.js";
import { maybeFinalizeNight } from "../../lib/finalize.js";
import { processBotNightActions } from "../../lib/bots.js";

/** Debug: advance night until dawn or stale (max iterations). */
export async function resolveDebugNightFully(roomCode: string): Promise<boolean> {
  const roomRef = db.collection("rooms").doc(roomCode);
  for (let i = 0; i < 120; i++) {
    const snap = await roomRef.get();
    const st = snap.data();
    if (!st || st.status !== "night") return false;
    const round = Number(st.round ?? 1);
    await processBotNightActions(roomCode, round);
    const players = await loadPlayers(roomCode);
    const humans = players.filter(
      (p) =>
        !p.isBot &&
        p.alive !== false &&
        !p.eliminated &&
        !p.expelled,
    );
    if (humans.length > 0) {
      await roomRef.update({
        nightReadyPlayerIds: FieldValue.arrayUnion(...humans.map((h) => h.id)),
      });
    }
    await processBotNightActions(roomCode, round);
    await maybeFinalizeNight(roomCode, round);
  }
  return true;
}
