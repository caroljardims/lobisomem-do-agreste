import type { NightActionInput, RoleId } from "folclore-game-engine";
import { isEnemyForMvp, type ScoringAlignment } from "folclore-game-engine";
import { db } from "./db.js";
import { addMvpPoints, appendInvestigationTarget, clearNightSuspicionFields } from "./playerPrivateScore.js";

type PlayerRow = Record<string, unknown> & { id: string; alignment?: string };

function alignOf(p: PlayerRow): ScoringAlignment {
  const a = p.alignment;
  if (a === "moradores" || a === "criaturas") return a;
  return null;
}

/** Suspeita + investigação (amanhecer da rodada `round`). */
export async function scoreMvpAtDawn(
  roomCode: string,
  round: number,
  players: PlayerRow[],
  secrets: Record<string, { role: RoleId }>,
  nightActions: Record<string, NightActionInput | undefined>,
): Promise<void> {
  const roomRef = db.collection("rooms").doc(roomCode);
  const privSnap = await roomRef.collection("playerPrivate").get();
  const suspicionByPlayer = new Map<string, string | null>();
  for (const d of privSnap.docs) {
    const t = d.data().nightSuspicionTargetId;
    suspicionByPlayer.set(d.id, typeof t === "string" ? t : null);
  }

  const updates: Promise<unknown>[] = [];

  for (const p of players) {
    const sid = p.id;
    const sec = secrets[sid];
    if (!sec) continue;
    const sus = suspicionByPlayer.get(sid);
    if (sus && secrets[sus]) {
      const tgtRow = players.find((x) => x.id === sus);
      if (!tgtRow) continue;
      const ok = isEnemyForMvp(sec.role, alignOf(p), secrets[sus]!.role, alignOf(tgtRow));
      if (ok) updates.push(addMvpPoints(roomCode, sid, round, "suspicion", 2));
    }
  }

  const investigateRoles = new Set<RoleId>(["cartomante", "boitata", "delegado"]);
  for (const [actorId, act] of Object.entries(nightActions)) {
    if (!act?.targetId) continue;
    const asec = secrets[actorId];
    const tsec = secrets[act.targetId];
    if (!asec || !tsec) continue;
    const actor = players.find((x) => x.id === actorId);
    const tgt = players.find((x) => x.id === act.targetId);
    if (!actor || !tgt) continue;

    if (act.role === "geni" && act.action === "converse") {
      if (isEnemyForMvp(asec.role, alignOf(actor), tsec.role, alignOf(tgt))) {
        updates.push(addMvpPoints(roomCode, actorId, round, "investigation", 2));
      }
      updates.push(appendInvestigationTarget(roomCode, actorId, act.targetId));
    } else if (investigateRoles.has(act.role) && (act.role !== "delegado" || act.action === "jail")) {
      if (act.targetId && isEnemyForMvp(asec.role, alignOf(actor), tsec.role, alignOf(tgt))) {
        updates.push(addMvpPoints(roomCode, actorId, round, "investigation", 2));
      }
      if (act.targetId && act.role !== "delegado") {
        updates.push(appendInvestigationTarget(roomCode, actorId, act.targetId));
      }
    }
  }

  await Promise.all(updates);
  await clearNightSuspicionFields(
    roomCode,
    players.map((p) => p.id),
  );
}

export async function scoreMvpVotesAfterDay(
  roomCode: string,
  round: number,
  votes: Record<string, string | null | undefined>,
  expelledId: string | null,
  players: PlayerRow[],
  secrets: Record<string, { role: RoleId }>,
): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  for (const [voterId, raw] of Object.entries(votes)) {
    if (voterId === "updatedAt" || raw === undefined) continue;
    const targetId = raw ? String(raw) : null;
    if (!targetId) continue;
    const vsec = secrets[voterId];
    const tsec = secrets[targetId];
    if (!vsec || !tsec) continue;
    const voter = players.find((p) => p.id === voterId);
    const tgt = players.find((p) => p.id === targetId);
    if (!voter || !tgt) continue;
    if (!isEnemyForMvp(vsec.role, alignOf(voter), tsec.role, alignOf(tgt))) continue;
    tasks.push(addMvpPoints(roomCode, voterId, round, "voteEnemy", 2));
    if (expelledId && expelledId === targetId) {
      tasks.push(addMvpPoints(roomCode, voterId, round, "voteExpelled", 3));
    }
  }
  await Promise.all(tasks);
}

/** Brás: +2 se recebeu ≥1 voto nesta rodada e não foi expulso. */
export async function scoreBrasRoundTease(
  roomCode: string,
  round: number,
  votes: Record<string, string | null | undefined>,
  brasPlayerId: string | null,
  expelledId: string | null,
): Promise<void> {
  if (!brasPlayerId) return;
  if (expelledId === brasPlayerId) return;
  let gotVote = false;
  for (const [voterId, raw] of Object.entries(votes)) {
    if (voterId === "updatedAt") continue;
    if (raw && String(raw) === brasPlayerId) {
      gotVote = true;
      break;
    }
  }
  if (!gotVote) return;
  await addMvpPoints(roomCode, brasPlayerId, round, "brasRoundTease", 2);
}

