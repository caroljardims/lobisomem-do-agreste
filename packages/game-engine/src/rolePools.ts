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
const TOWN_9_11 = ["delegado", "doutor", "cartomante", "coronel", "boitata"] as const satisfies readonly RoleId[];
/** 8 moradores especiais; sem Padre neste tier automático (evita par Mula/Padre incompleto). Curupira entra pelo pacote neutro. */
const TOWN_12: RoleId[] = [
  "delegado",
  "doutor",
  "cartomante",
  "coronel",
  "boitata",
  "mae_de_santo",
  "geni",
  "cangaceiro",
];

/** Pares simétricos (ambos obrigatórios juntos). Mula→Padre é só num sentido (ver validate). */
const SYMMETRIC_PAIRS: [RoleId, RoleId][] = [
  ["coronel", "boitata"],
  ["geni", "boto"],
  ["cangaceiro", "iara"],
];

/** Completa papéis obrigatórios dos pares até ponto fixo. Mula na mesa exige Padre; Padre pode existir sem Mula. */
function closePairDependencies(roles: RoleId[]): RoleId[] {
  const out = [...roles];
  let changed = true;
  while (changed) {
    changed = false;
    const set = new Set(out);
    if (set.has("mula") && !set.has("padre")) {
      out.push("padre");
      changed = true;
      continue;
    }
    for (const [a, b] of SYMMETRIC_PAIRS) {
      if (set.has(a) && !set.has(b)) {
        out.push(b);
        set.add(b);
        changed = true;
      }
      if (set.has(b) && !set.has(a)) {
        out.push(a);
        set.add(a);
        changed = true;
      }
    }
  }
  return out;
}

export function validateRoleComposition(roles: RoleId[]): boolean {
  const set = new Set(roles);
  if (set.has("mula") && !set.has("padre")) return false;
  for (const [a, b] of SYMMETRIC_PAIRS) {
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

/** Brás + um neutro (Curupira ou Boitatá) que ainda não está em `alreadyPresent`. */
function neutralsPackForTable(rng: () => number, alreadyPresent: RoleId[]): RoleId[] {
  const secondPool = NEUTRAL_ROLES.filter((r) => r !== "bras_cubas" && !alreadyPresent.includes(r));
  if (secondPool.length === 0) throw new Error("Sem neutro disponível para a mesa");
  return ["bras_cubas", pickDistinct(secondPool, 1, rng)[0]!];
}

/** Criaturas sorteadas; pares Geni↔Boto e Cangaceiro↔Iara; Mula só se Padre já estiver na mesa. */
function pickCreaturesForTable(town: RoleId[], count: number, rng: () => number): RoleId[] {
  if (count <= 0) return [];
  const hasGeni = town.includes("geni");
  const hasCang = town.includes("cangaceiro");
  const hasPadre = town.includes("padre");
  const basePool = CREATURE_ROLES.filter((r) => (hasPadre ? true : r !== "mula"));

  if (hasGeni && hasCang) {
    if (count < 2) throw new Error("Mesa com Geni e Cangaceiro exige ao menos 2 vagas de criatura");
    if (count === 2) return ["boto", "iara"];
    const pool = basePool.filter((r) => r !== "boto" && r !== "iara");
    return ["boto", "iara", ...pickDistinct(pool, count - 2, rng)];
  }

  if (hasGeni) {
    const pool = basePool.filter((r) => r !== "boto" && r !== "iara");
    if (count === 1) return ["boto"];
    return ["boto", ...pickDistinct(pool, count - 1, rng)];
  }

  if (hasCang) {
    const pool = basePool.filter((r) => r !== "iara");
    if (count === 1) return ["iara"];
    return ["iara", ...pickDistinct(pool, count - 1, rng)];
  }

  return pickDistinct(
    basePool.filter((r) => r !== "iara"),
    count,
    rng,
  );
}

/**
 * Para 12+: 8 moradores especiais + 2 neutros (Brás + Curupira) + criaturas + aldeões.
 */
function buildRoles12Plus(n: number, rng: () => number): RoleId[] {
  const town = [...TOWN_12];
  const neutrals = neutralsPackForTable(rng, town);
  const remaining = n - town.length - neutrals.length;
  if (remaining < 5) {
    const creatures = pickCreaturesForTable(town, remaining, rng);
    return [...town, ...neutrals, ...creatures];
  }
  const creatureCount = Math.min(5, remaining - 1);
  const aldeoes = remaining - creatureCount;
  const creatures = pickCreaturesForTable(town, creatureCount, rng);
  const ald: RoleId[] = Array.from({ length: aldeoes }, () => "aldeao");
  return [...town, ...neutrals, ...creatures, ...ald];
}

/** Monta lista final de papéis (sem atribuir a jogadores). */
export function buildResolvedRoles(n: number, rng: () => number): RoleId[] {
  if (n < 5) throw new Error("Mínimo 5 jogadores");

  if (n === 5) {
    const creaturePool = CREATURE_ROLES.filter((r) => r !== "iara" && r !== "mula");
    for (let k = 0; k < 400; k++) {
      const creatures = pickDistinct([...creaturePool], 1, rng);
      const neutrals = pickDistinct([...NEUTRAL_ROLES], 1, rng);
      let roles = closePairDependencies([...TOWN_5, ...creatures, ...neutrals]);
      if (roles.length > n) continue;
      while (roles.length < n) roles.push("aldeao");
      if (roles.length === n && validateRoleComposition(roles)) return roles;
    }
    throw new Error("Composição 5 jogadores inválida");
  }

  if (n === 7) {
    const creaturePool = CREATURE_ROLES.filter((r) => r !== "iara" && r !== "mula");
    for (let k = 0; k < 120; k++) {
      const creatures = pickDistinct([...creaturePool], 2, rng);
      const roles: RoleId[] = [...TOWN_7, "aldeao", "bras_cubas", ...creatures];
      if (validateRoleComposition(roles)) return roles;
    }
    throw new Error("Composição 7 jogadores inválida");
  }

  if (n >= 9 && n <= 11) {
    const aldeoes = n - 9;
    const ald: RoleId[] = Array.from({ length: aldeoes }, () => "aldeao");
    const creaturePool = CREATURE_ROLES.filter((r) => r !== "iara" && r !== "mula");
    for (let k = 0; k < 200; k++) {
      const creatures = pickDistinct([...creaturePool], 2, rng);
      const neutrals = neutralsPackForTable(rng, [...TOWN_9_11]);
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
