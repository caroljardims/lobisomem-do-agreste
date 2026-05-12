import type { RoleId } from "./types.js";
import { isCreatureRole, ROLE_SIDE } from "./roles.js";

/** Alinhamento escolhido na 1ª noite (Curupira/Boitatá). Brás Cubas não usa. */
export type WinNeutralAlignment = "moradores" | "criaturas";

export interface WinPlayerSnapshot {
  id: string;
  role: RoleId;
  alive: boolean;
  eliminated: boolean;
  expelled: boolean;
  individualObjectiveMet: boolean;
  /** Neutros que escolhem lado para vitória coletiva. */
  alignment?: WinNeutralAlignment | null;
}

function countsAsMoradorForMajority(p: WinPlayerSnapshot): boolean {
  const side = ROLE_SIDE[p.role];
  if (side === "morador") return true;
  if (side !== "neutro") return false;
  if (p.role === "bras_cubas") return false;
  return p.alignment === "moradores";
}

function countsAsCreatureForMajority(p: WinPlayerSnapshot): boolean {
  const side = ROLE_SIDE[p.role];
  if (side === "criatura") return true;
  if (side !== "neutro") return false;
  if (p.role === "bras_cubas") return false;
  return p.alignment === "criaturas";
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

  const creatures = Object.values(players).filter((p) => alive(p) && countsAsCreatureForMajority(p));
  const moradores = Object.values(players).filter((p) => alive(p) && countsAsMoradorForMajority(p));

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
