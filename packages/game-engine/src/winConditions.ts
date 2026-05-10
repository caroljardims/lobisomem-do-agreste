import type { RoleId } from "./types.js";
import { isCreatureRole, ROLE_SIDE } from "./roles.js";

export interface WinPlayerSnapshot {
  id: string;
  role: RoleId;
  alive: boolean;
  eliminated: boolean;
  expelled: boolean;
  individualObjectiveMet: boolean;
}

export type CollectiveWinner = "moradores" | "criaturas" | null;

/**
 * Condições coletivas (CLAUDE.md — após amanhecer ou expulsão).
 * Vitórias individuais não encerram o jogo.
 */
export function checkCollectiveWin(
  players: Record<string, WinPlayerSnapshot>,
  round: number,
  maxRounds: number,
): CollectiveWinner {
  if (round > maxRounds) return "criaturas";

  const alive = (p: WinPlayerSnapshot) =>
    p.alive && !p.eliminated && !p.expelled;

  const creatures = Object.values(players).filter(
    (p) => alive(p) && ROLE_SIDE[p.role] === "criatura",
  );
  const moradores = Object.values(players).filter(
    (p) => alive(p) && ROLE_SIDE[p.role] === "morador",
  );

  if (creatures.length === 0) return "moradores";
  if (creatures.length >= moradores.length) return "criaturas";

  const allCreaturesMetObjective = Object.values(players)
    .filter((p) => ROLE_SIDE[p.role] === "criatura" && alive(p))
    .every((p) => p.individualObjectiveMet);
  if (creatures.length > 0 && allCreaturesMetObjective) return "criaturas";

  return null;
}

export function isCreatureSide(role: RoleId): boolean {
  return isCreatureRole(role);
}
