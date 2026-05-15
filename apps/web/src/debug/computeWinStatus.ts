import type { RoleId } from "folclore-game-engine";
import {
  checkCollectiveWinDetailed,
  countsAsCreatureForMajority,
  countsAsMoradorForMajority,
  type WinPlayerSnapshot,
} from "folclore-game-engine";
import type { PlayerDoc } from "../types.js";

export function snapshotsFromPlayersAndSecrets(
  players: PlayerDoc[],
  secrets: Record<string, { role?: string }>,
): Record<string, WinPlayerSnapshot> {
  const out: Record<string, WinPlayerSnapshot> = {};
  for (const p of players) {
    const id = p.id;
    if (!id) continue;
    const role = secrets[id]?.role as RoleId | undefined;
    if (!role) continue;
    out[id] = {
      id,
      role,
      alive: p.alive !== false,
      eliminated: Boolean(p.eliminated),
      expelled: Boolean(p.expelled),
      individualObjectiveMet: Boolean(p.individualObjectiveMet),
      alignment:
        p.alignment === "moradores" || p.alignment === "criaturas" ? p.alignment : null,
    };
  }
  return out;
}

export type WinStatusUi = {
  creatureCount: number;
  moradorCount: number;
  detailLabel: string;
};

export function computeWinStatusUi(
  winPlayers: Record<string, WinPlayerSnapshot>,
  round: number,
  maxRounds: number,
  tablePlayerCount: number,
): WinStatusUi {
  const alive = (p: WinPlayerSnapshot) => p.alive && !p.eliminated && !p.expelled;
  const creatures = Object.values(winPlayers).filter((p) => alive(p) && countsAsCreatureForMajority(p));
  const moradores = Object.values(winPlayers).filter((p) => alive(p) && countsAsMoradorForMajority(p));
  const d = checkCollectiveWinDetailed(winPlayers, round, maxRounds, tablePlayerCount);
  let detailLabel = "em andamento";
  if (d.winner === "moradores") detailLabel = "vitória dos moradores (condição atual)";
  if (d.winner === "criaturas") detailLabel = "vitória das criaturas (condição atual)";
  return {
    creatureCount: creatures.length,
    moradorCount: moradores.length,
    detailLabel,
  };
}
