import type { RoleId } from "./types.js";
import { ROLE_SIDE } from "./roles.js";

/** Alinhamento escolhido na 1ª noite (Curupira / Boitatá). */
export type ScoringAlignment = "moradores" | "criaturas" | null;

/**
 * Time efetivo para pontuação de “inimigo” (suspeita, voto, investigação).
 * Brás Cubas não tem lado — retorna null (sem pontos por “inimigo”).
 */
export function effectiveScoringFaction(
  role: RoleId,
  playerAlignment: ScoringAlignment,
): "moradores" | "criaturas" | null {
  if (role === "bras_cubas") return null;
  const side = ROLE_SIDE[role];
  if (side === "criatura") return "criaturas";
  if (side === "morador") return "moradores";
  if (role === "curupira" || role === "boitata") {
    if (playerAlignment === "moradores" || playerAlignment === "criaturas") return playerAlignment;
    return null;
  }
  return null;
}

/** O alvo está no lado oposto ao do observador? (neutro sem alinhamento = sem inimigo definido). */
export function isEnemyForMvp(
  viewerRole: RoleId,
  viewerAlignment: ScoringAlignment,
  targetRole: RoleId,
  targetAlignment: ScoringAlignment,
): boolean {
  const v = effectiveScoringFaction(viewerRole, viewerAlignment);
  const t = effectiveScoringFaction(targetRole, targetAlignment);
  if (v == null || t == null) return false;
  return v !== t;
}
