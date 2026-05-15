import type { RoleId } from "./types.js";
import { CREATURE_ROLES_WITH_INDIVIDUAL_OBJECTIVE, isCreatureRole, ROLE_SIDE } from "./roles.js";

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

/** Qual regra coletiva disparou o fim (para texto na crônica). */
export type CollectiveWinReasonCode =
  | "creatures_extinct"
  | "creatures_majority_or_tie"
  | "creatures_all_objectives"
  | "full_moon";

export type CollectiveWinDetail = {
  winner: CollectiveWinner;
  reason: CollectiveWinReasonCode | null;
};

/**
 * Condições coletivas (CLAUDE.md — após amanhecer ou expulsão).
 * Vitórias individuais não encerram o jogo.
 */
export function checkCollectiveWinDetailed(
  players: Record<string, WinPlayerSnapshot>,
  round: number,
  maxRounds: number,
): CollectiveWinDetail {
  const none: CollectiveWinDetail = { winner: null, reason: null };

  if (round > maxRounds) {
    return { winner: "criaturas", reason: "full_moon" };
  }

  const alive = (p: WinPlayerSnapshot) => p.alive && !p.eliminated && !p.expelled;

  const creatures = Object.values(players).filter((p) => alive(p) && countsAsCreatureForMajority(p));
  const moradores = Object.values(players).filter((p) => alive(p) && countsAsMoradorForMajority(p));

  if (creatures.length === 0) {
    return { winner: "moradores", reason: "creatures_extinct" };
  }
  if (creatures.length >= moradores.length) {
    return { winner: "criaturas", reason: "creatures_majority_or_tie" };
  }

  const allCreaturesMetObjective = Object.values(players)
    .filter(
      (p) =>
        ROLE_SIDE[p.role] === "criatura" &&
        CREATURE_ROLES_WITH_INDIVIDUAL_OBJECTIVE.includes(p.role) &&
        alive(p),
    )
    .every((p) => p.individualObjectiveMet);
  if (creatures.length > 0 && allCreaturesMetObjective) {
    return { winner: "criaturas", reason: "creatures_all_objectives" };
  }

  return none;
}

export function checkCollectiveWin(
  players: Record<string, WinPlayerSnapshot>,
  round: number,
  maxRounds: number,
): CollectiveWinner {
  return checkCollectiveWinDetailed(players, round, maxRounds).winner;
}

/** Parágrafo explícito para o Folhetim / crônica ao encerrar por vitória coletiva. */
export function collectiveWinChronicleMessagePt(detail: CollectiveWinDetail): string | null {
  if (!detail.winner || !detail.reason) return null;
  switch (detail.reason) {
    case "creatures_extinct":
      return "O último folheto foi entregue. A cidade respirou fundo — o folclore recuou para o mato, para o rio, para a escuridão de onde veio. Os moradores venceram.";
    case "creatures_majority_or_tie":
      return "Quando a fumaça baixou, havia mais sombra do que gente na praça. A Bucaré floresceu amarelo na madrugada — e o folclore sorriu. Vitória das criaturas.";
    case "creatures_all_objectives":
      return "Não precisaram de força. Precisaram de paciência — e Bucaré tinha mais segredos do que a cidade conseguia guardar. O folclore cumpriu o que veio fazer. Vitória das criaturas.";
    case "full_moon":
      return "A lua cheia chegou antes da cidade chegar a um nome. Quando ela está inteira no céu, o folclore não precisa mais se esconder. A noite pertence às criaturas.";
    default:
      return null;
  }
}

export function isCreatureSide(role: RoleId): boolean {
  return isCreatureRole(role);
}
