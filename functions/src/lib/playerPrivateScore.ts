import { FieldValue } from "firebase-admin/firestore";
import type { RoleId } from "folclore-game-engine";
import { db } from "./db.js";

export type MvpCategory =
  | "suspicion"
  | "voteEnemy"
  | "voteExpelled"
  | "investigation"
  | "objective"
  | "survival"
  | "brasExpulsion"
  | "brasRoundTease";

const CATEGORY_FIELD: Record<MvpCategory, string> = {
  suspicion: "bdSuspicion",
  voteEnemy: "bdVoteEnemy",
  voteExpelled: "bdVoteExpelled",
  investigation: "bdInvestigation",
  objective: "bdObjective",
  survival: "bdSurvival",
  brasExpulsion: "bdBrasExpulsion",
  brasRoundTease: "bdBrasRoundTease",
};

export function playerPrivateRef(roomCode: string, playerId: string) {
  return db.collection("rooms").doc(roomCode).collection("playerPrivate").doc(playerId);
}

function zeroBreakdownFields(): Record<string, number> {
  const o: Record<string, number> = {};
  for (const f of Object.values(CATEGORY_FIELD)) o[f] = 0;
  return o;
}

/** Cria ou mantém documento privado de MVP (pontos ocultos até o fim). */
export async function ensurePlayerPrivateDoc(roomCode: string, playerId: string, authUid: string): Promise<void> {
  const ref = playerPrivateRef(roomCode, playerId);
  await ref.set(
    {
      authUid,
      totalGamePoints: 0,
      investigationTargetsUsed: [],
      nightSuspicionTargetId: null,
      ...zeroBreakdownFields(),
    },
    { merge: true },
  );
}

export async function addMvpPoints(
  roomCode: string,
  playerId: string,
  round: number,
  category: MvpCategory,
  amount: number,
): Promise<void> {
  if (amount === 0) return;
  const ref = playerPrivateRef(roomCode, playerId);
  const rk = `roundPoints.${round}`;
  await ref.set(
    {
      [rk]: FieldValue.increment(amount),
      totalGamePoints: FieldValue.increment(amount),
      [CATEGORY_FIELD[category]]: FieldValue.increment(amount),
    },
    { merge: true },
  );
}

export async function grantObjectiveMvp(roomCode: string, playerId: string, round: number): Promise<void> {
  await addMvpPoints(roomCode, playerId, round, "objective", 10);
}

/** Aldeão: objetivo de pódio — vitória coletiva dos moradores + sobrevivência (sem exigir voto na criatura certa). */
export async function grantAldeaoObjectiveIfMoradoresWon(
  roomCode: string,
  round: number,
  winner: string,
  players: Array<{
    id: string;
    alive?: boolean;
    eliminated?: boolean;
    expelled?: boolean;
    individualObjectiveMet?: boolean;
  }>,
  secrets: Record<string, { role: RoleId } | undefined>,
): Promise<void> {
  if (winner !== "moradores") return;
  const roomRef = db.collection("rooms").doc(roomCode);
  const tasks: Promise<unknown>[] = [];
  for (const p of players) {
    if (secrets[p.id]?.role !== "aldeao") continue;
    const survived = p.alive !== false && !p.eliminated && !p.expelled;
    if (!survived || p.individualObjectiveMet) continue;
    tasks.push(
      roomRef.collection("players").doc(p.id).update({ individualObjectiveMet: true }),
      grantObjectiveMvp(roomCode, p.id, round),
    );
  }
  await Promise.all(tasks);
}

export async function appendInvestigationTarget(roomCode: string, investigatorId: string, targetId: string): Promise<void> {
  await playerPrivateRef(roomCode, investigatorId).set(
    {
      investigationTargetsUsed: FieldValue.arrayUnion(targetId),
    },
    { merge: true },
  );
}

export async function setNightSuspicion(roomCode: string, playerId: string, authUid: string, targetId: string | null): Promise<void> {
  await playerPrivateRef(roomCode, playerId).set(
    {
      authUid,
      nightSuspicionTargetId: targetId,
    },
    { merge: true },
  );
}

export async function clearNightSuspicionFields(roomCode: string, playerIds: string[]): Promise<void> {
  const batch = db.batch();
  for (const pid of playerIds) {
    batch.set(
      playerPrivateRef(roomCode, pid),
      {
        nightSuspicionTargetId: null,
      },
      { merge: true },
    );
  }
  await batch.commit();
}
