import { FieldValue } from "firebase-admin/firestore";
import type { RoleId } from "folclore-game-engine";
import {
  countsAsCreatureForMajority,
  countsAsMoradorForMajority,
  type WinPlayerSnapshot,
} from "folclore-game-engine";
import { db } from "./db.js";
import { loadPlayers, loadSecrets, randomId } from "../helpers.js";

type PrivateSnap = {
  totalGamePoints?: number;
  bdSuspicion?: number;
  bdVoteEnemy?: number;
  bdVoteExpelled?: number;
  bdInvestigation?: number;
  bdObjective?: number;
  bdBrasRoundTease?: number;
};

function breakdownFromPrivate(d: PrivateSnap, survivalBonus: number) {
  return {
    suspicion: Number(d.bdSuspicion ?? 0),
    voteEnemy: Number(d.bdVoteEnemy ?? 0),
    voteExpelledBonus: Number(d.bdVoteExpelled ?? 0),
    investigation: Number(d.bdInvestigation ?? 0),
    objective: Number(d.bdObjective ?? 0),
    survival: survivalBonus,
    brasRoundTease: Number(d.bdBrasRoundTease ?? 0),
  };
}

function collectiveWinForPlayer(winner: string, p: WinPlayerSnapshot): boolean {
  if (winner === "bots") return false;
  if (winner === "moradores") return countsAsMoradorForMajority(p);
  if (winner === "criaturas") return countsAsCreatureForMajority(p);
  return winner === p.id;
}

function playerWonGame(
  winner: string,
  ws: WinPlayerSnapshot | undefined,
  row: { objectiveMet: boolean; survived: boolean },
  tablePlayerCount: number,
): boolean {
  if (!ws) return false;
  if (
    tablePlayerCount === 5 &&
    (ws.role === "curupira" || ws.role === "boitata") &&
    row.objectiveMet &&
    row.survived
  ) {
    return true;
  }
  return collectiveWinForPlayer(winner, ws);
}

export async function finalizeMvpLedgerIfNeeded(roomCode: string): Promise<void> {
  const roomRef = db.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  const room = roomSnap.data() ?? {};
  if (room.status !== "ended" || room.mvpLedgerApplied === true) return;
  if (room.debug === true) {
    await roomRef.update({ mvpLedgerApplied: true });
    return;
  }

  const winner = String(room.winner ?? "");
  const finalRound = Number(room.round ?? 1);
  const [players, secrets] = await Promise.all([loadPlayers(roomCode), loadSecrets(roomCode)]);

  const winSnaps: Record<string, WinPlayerSnapshot> = {};
  for (const p of players) {
    const r = secrets[p.id]?.role;
    if (!r) continue;
    winSnaps[p.id] = {
      id: p.id,
      role: r,
      alive: p.alive !== false,
      eliminated: Boolean(p.eliminated),
      expelled: Boolean(p.expelled),
      individualObjectiveMet: Boolean(p.individualObjectiveMet),
      alignment: p.alignment === "moradores" || p.alignment === "criaturas" ? p.alignment : null,
    };
  }

  const privSnap2 = await roomRef.collection("playerPrivate").get();
  const privateById = new Map<string, PrivateSnap & { authUid?: string }>();
  for (const d of privSnap2.docs) {
    privateById.set(d.id, d.data() as PrivateSnap & { authUid?: string });
  }

  type Row = {
    id: string;
    name: string;
    uid: string;
    isBot: boolean;
    points: number;
    objectiveMet: boolean;
    survived: boolean;
    role: RoleId;
    side: string;
  };

  const rows: Row[] = [];
  for (const p of players) {
    const sec = secrets[p.id];
    if (!sec) continue;
    const priv = privateById.get(p.id) ?? {};
    const survived = p.alive !== false && !p.eliminated && !p.expelled;
    const survivalBonus = !p.isBot && survived ? 1 : 0;
    const points = Number(priv.totalGamePoints ?? 0) + survivalBonus;
    rows.push({
      id: p.id,
      name: String(p.name ?? p.id),
      uid: String(priv.authUid ?? p.uid ?? ""),
      isBot: Boolean(p.isBot),
      points,
      objectiveMet: Boolean(p.individualObjectiveMet),
      survived,
      role: sec.role,
      side: sec.side,
    });
  }

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (Number(b.objectiveMet) !== Number(a.objectiveMet)) return Number(b.objectiveMet) - Number(a.objectiveMet);
    if (Number(b.survived) !== Number(a.survived)) return Number(b.survived) - Number(a.survived);
    return a.name.localeCompare(b.name, "pt");
  });

  const rankById = new Map<string, number>();
  rows.forEach((r, i) => rankById.set(r.id, i + 1));

  const gameId = randomId();
  const tablePlayerCount = Number(room.gameTablePlayerCount ?? 0);
  const participantUids = [
    ...new Set(
      rows
        .filter((r) => !r.isBot && r.uid && !r.uid.startsWith("bot_"))
        .map((r) => r.uid),
    ),
  ];
  const historyPlayers = rows.map((r) => {
    const priv = privateById.get(r.id) ?? {};
    const ws = winSnaps[r.id];
    const survivalBonus = !r.isBot && r.survived ? 1 : 0;
    return {
      playerId: r.id,
      uid: r.uid,
      displayName: r.name,
      role: r.role,
      side: r.side,
      points: r.points,
      rank: rankById.get(r.id) ?? 0,
      isBot: r.isBot,
      individualObjectiveMet: r.objectiveMet,
      collectiveWin: playerWonGame(winner, ws, r, tablePlayerCount),
      breakdown: breakdownFromPrivate(priv, survivalBonus),
    };
  });

  // Gravar pontos de todos os jogadores humanos em paralelo ANTES de setar
  // mvpLedgerApplied. Se qualquer transação falhar, a função pode ser
  // reexecutada sem perda permanente de pontos.
  await Promise.all(
    rows
      .filter((r) => !r.isBot && r.uid && !r.uid.startsWith("bot_"))
      .map((r) => {
        const rank = rankById.get(r.id) ?? 99;
        const uref = db.collection("users").doc(r.uid);
        const pref = db.collection("publicLeaderboard").doc(r.uid);
        const won = playerWonGame(winner, winSnaps[r.id], r, tablePlayerCount);
        return db.runTransaction(async (tx) => {
          const [uSnap, pSnap] = await Promise.all([tx.get(uref), tx.get(pref)]);
          const prevBest = Math.max(Number(uSnap.data()?.bestGame ?? 0), Number(pSnap.data()?.bestGame ?? 0));
          const nextBest = Math.max(prevBest, r.points);
          const uData = uSnap.data() ?? {};
          const prevRc = (uData.rolePlayCounts as Record<string, number> | undefined) ?? {};
          const nextRc = { ...prevRc, [r.role]: (prevRc[r.role] ?? 0) + 1 };
          let favoriteRole: string | null = null;
          let maxPlays = -1;
          for (const [roleId, n] of Object.entries(nextRc)) {
            const c = Number(n);
            if (c > maxPlays || (c === maxPlays && (favoriteRole === null || roleId < favoriteRole))) {
              maxPlays = c;
              favoriteRole = roleId;
            }
          }
          tx.set(
            uref,
            {
              rolePlayCounts: nextRc,
              favoriteRole,
              totalPoints: FieldValue.increment(r.points),
              gamesPlayed: FieldValue.increment(1),
              gamesWon: FieldValue.increment(won ? 1 : 0),
              mvpCount: FieldValue.increment(rank === 1 ? 1 : 0),
              podiumCount: FieldValue.increment(rank <= 3 ? 1 : 0),
              bestGame: nextBest,
            },
            { merge: true },
          );
          tx.set(
            pref,
            {
              uid: r.uid,
              displayName: r.name,
              totalPoints: FieldValue.increment(r.points),
              gamesPlayed: FieldValue.increment(1),
              mvpCount: FieldValue.increment(rank === 1 ? 1 : 0),
              podiumCount: FieldValue.increment(rank <= 3 ? 1 : 0),
              bestGame: nextBest,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        });
      }),
  );

  // Só marca como aplicado depois que todas as transações de usuário tiverem
  // sucesso — garantindo que uma reexecução sempre parta do zero seguro.
  const batch = db.batch();
  batch.set(db.collection("gameHistory").doc(gameId), {
    roomCode,
    playedAt: FieldValue.serverTimestamp(),
    winner,
    rounds: finalRound,
    players: historyPlayers,
    participantUids,
  });
  batch.update(roomRef, { mvpLedgerApplied: true, lastGameHistoryId: gameId });
  await batch.commit();
}
