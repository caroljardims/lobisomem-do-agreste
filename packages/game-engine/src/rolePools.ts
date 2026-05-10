import type { RoleId } from "./types.js";
import { CREATURE_ROLES, NEUTRAL_ROLES } from "./roles.js";

export function maxRoundsForPlayerCount(n: number): number {
  if (n <= 5) return 4;
  if (n === 7) return 5;
  if (n >= 9 && n <= 11) return 6;
  return 7;
}

const TOWN_5 = ["delegado", "doutor"] as const satisfies readonly RoleId[];
const TOWN_7 = ["delegado", "doutor", "cartomante"] as const satisfies readonly RoleId[];
const TOWN_9_11 = ["delegado", "doutor", "cartomante", "coronel"] as const satisfies readonly RoleId[];
const TOWN_12: RoleId[] = [
  "delegado",
  "doutor",
  "cartomante",
  "coronel",
  "curupira",
  "boitata",
  "padre",
  "mae_de_santo",
];

const PAIRS: [RoleId, RoleId][] = [
  ["mula", "padre"],
  ["coronel", "boitata"],
  ["geni", "boto"],
  ["cangaceiro", "iara"],
];

export function validateRoleComposition(roles: RoleId[]): boolean {
  const set = new Set(roles);
  for (const [a, b] of PAIRS) {
    if (set.has(a) && !set.has(b)) return false;
    if (set.has(b) && !set.has(a)) return false;
  }
  return true;
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function pickDistinct(pool: RoleId[], count: number, rng: () => number): RoleId[] {
  const copy = [...pool];
  shuffleInPlace(copy, rng);
  return copy.slice(0, count);
}

export interface DealResult {
  byPlayerId: Record<string, RoleId>;
  spokespersonId: string;
}

/** Neutros para 9–11: Brás sempre + um sorteado entre Geni/Cangaceiro. */
function neutralsFor9To11(rng: () => number): RoleId[] {
  const otherPool = NEUTRAL_ROLES.filter((r) => r !== "bras_cubas");
  return ["bras_cubas", pickDistinct(otherPool, 1, rng)[0]!];
}

/**
 * Para 12+: ajusta criaturas vs aldeões para fechar `n` com 8 especiais + 2 neutros + Brás já em neutrosFor9To11 pattern:
 * usamos 2 neutros (Brás + outro) e `creatureCount` derivado.
 */
function buildRoles12Plus(n: number, rng: () => number): RoleId[] {
  const neutrals = neutralsFor9To11(rng);
  const town = [...TOWN_12];
  const remaining = n - town.length - neutrals.length;
  if (remaining < 5) {
    const creatures = pickDistinct([...CREATURE_ROLES], remaining, rng);
    return [...town, ...neutrals, ...creatures];
  }
  const creatureCount = Math.min(5, remaining - 1);
  const aldeoes = remaining - creatureCount;
  const creatures = pickDistinct([...CREATURE_ROLES], creatureCount, rng);
  const ald: RoleId[] = Array.from({ length: aldeoes }, () => "aldeao");
  return [...town, ...neutrals, ...creatures, ...ald];
}

/** Monta lista final de papéis (sem atribuir a jogadores). */
export function buildResolvedRoles(n: number, rng: () => number): RoleId[] {
  if (n < 5) throw new Error("Mínimo 5 jogadores");

  if (n === 5) {
    for (let k = 0; k < 80; k++) {
      const creatures = pickDistinct([...CREATURE_ROLES], 1, rng);
      const neutrals = pickDistinct(
        NEUTRAL_ROLES.filter((r) => r !== "bras_cubas"),
        1,
        rng,
      );
      const roles: RoleId[] = [...TOWN_5, "aldeao", ...creatures, ...neutrals];
      if (validateRoleComposition(roles)) return roles;
    }
    throw new Error("Composição 5 jogadores inválida");
  }

  if (n === 7) {
    for (let k = 0; k < 120; k++) {
      const creatures = pickDistinct([...CREATURE_ROLES], 2, rng);
      const roles: RoleId[] = [...TOWN_7, "aldeao", "bras_cubas", ...creatures];
      if (validateRoleComposition(roles)) return roles;
    }
    throw new Error("Composição 7 jogadores inválida");
  }

  if (n >= 9 && n <= 11) {
    const aldeoes = n - 9;
    const ald: RoleId[] = Array.from({ length: aldeoes }, () => "aldeao");
    for (let k = 0; k < 200; k++) {
      const creatures = pickDistinct([...CREATURE_ROLES], 3, rng);
      const neutrals = neutralsFor9To11(rng);
      const roles = [...TOWN_9_11, ...ald, ...creatures, ...neutrals];
      if (validateRoleComposition(roles)) return roles;
    }
    throw new Error("Composição 9–11 jogadores inválida");
  }

  for (let k = 0; k < 300; k++) {
    const roles = buildRoles12Plus(n, rng);
    if (roles.length === n && validateRoleComposition(roles)) return roles;
  }
  throw new Error("Composição 12+ jogadores inválida");
}

export function dealRoles(playerIds: string[], rng: () => number): DealResult {
  const n = playerIds.length;
  for (let attempt = 0; attempt < 500; attempt++) {
    const roles = buildResolvedRoles(n, rng);
    if (roles.length !== n) throw new Error(`Roles length ${roles.length} != ${n}`);
    if (!validateRoleComposition(roles)) continue;
    shuffleInPlace(roles, rng);
    const byPlayerId: Record<string, RoleId> = {};
    playerIds.forEach((id, i) => {
      byPlayerId[id] = roles[i]!;
    });
    const spokespersonId = playerIds[Math.floor(rng() * playerIds.length)]!;
    return { byPlayerId, spokespersonId };
  }
  throw new Error("Não foi possível sortear papéis válidos");
}
