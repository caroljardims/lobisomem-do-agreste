import type { RoleId } from "./types.js";
import { CREATURE_ROLES, NEUTRAL_ROLES } from "./roles.js";

export function maxRoundsForPlayerCount(n: number): number {
  if (n === 5 || n === 6) return 7;
  if (n < 5) return 4;
  if (n === 7 || n === 8) return 5;
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
 * Para 12+: 8 moradores especiais + 2 neutros (Brás + Curupira ou Boitatá) + criaturas + aldeões.
 * Funciona para qualquer n ≥ 12 (e n ≥ 10 quando town+neutrals já cabem no total).
 */
function buildRoles12Plus(n: number, rng: () => number): RoleId[] {
  const town = [...TOWN_12];
  const neutrals = neutralsPackForTable(rng, town);
  const baseLen = town.length + neutrals.length;
  if (n < baseLen) {
    throw new Error(`Mesa ${n}: abaixo do mínimo de papéis fixos (${baseLen}).`);
  }
  const remaining = n - baseLen;
  if (remaining < 5) {
    const creatures = pickCreaturesForTable(town, remaining, rng);
    const out = [...town, ...neutrals, ...creatures];
    while (out.length < n) out.push("aldeao");
    return out;
  }
  const creatureCount = Math.min(5, remaining - 1);
  const creatures = pickCreaturesForTable(town, creatureCount, rng);
  const aldeoesCount = remaining - creatures.length;
  const ald: RoleId[] = Array.from({ length: aldeoesCount }, () => "aldeao");
  return [...town, ...neutrals, ...creatures, ...ald];
}

/** Papéis que o Lobisomem não pode eliminar; mesas 7+ devem incluir ao menos um no pool. */
const LOBISOMEM_IMMUNE_ROLES: readonly RoleId[] = ["mula", "mae_de_santo", "bras_cubas", "cangaceiro", "boitata"];

export function poolHasLobisomemImmuneTarget(roles: readonly RoleId[]): boolean {
  return LOBISOMEM_IMMUNE_ROLES.some((r) => roles.includes(r));
}

function findImmuneInjectionSlot(roles: readonly RoleId[]): number {
  const i = roles.indexOf("aldeao");
  if (i >= 0) return i;
  const disposable: RoleId[] = ["cartomante", "delegado", "doutor", "coronel"];
  for (const d of disposable) {
    const j = roles.lastIndexOf(d);
    if (j >= 0) return j;
  }
  return -1;
}

function tryInjectImmuneRole(roles: RoleId[], n: number, newRole: RoleId): RoleId[] | null {
  const slot = findImmuneInjectionSlot(roles);
  if (slot < 0) return null;
  const replaced = roles[slot]!;
  let next = [...roles];
  next[slot] = newRole;
  next = closePairDependencies(next);
  if (next.length > n) {
    const ri = next.lastIndexOf("aldeao");
    if (ri < 0) return null;
    next.splice(ri, 1);
  }
  while (next.length < n) next.push("aldeao");
  if (next.length !== n) return null;
  if (!validateRoleComposition(next)) return null;
  console.log(`Immune character injected: ${newRole} replaced ${replaced}`);
  return next;
}

/** Garante ≥1 alvo imune ao Lobisomem em mesas com 7+ jogadores (não altera 5–6). */
export function ensureWolfImmuneTargetSevenPlus(roles: RoleId[], n: number): RoleId[] {
  if (n < 7) return roles;
  if (poolHasLobisomemImmuneTarget(roles)) return roles;

  const set = new Set(roles);
  const candidates: Array<{ role: RoleId; when: () => boolean }> = [
    { role: "bras_cubas", when: () => !set.has("bras_cubas") },
    { role: "mae_de_santo", when: () => !set.has("mae_de_santo") },
    { role: "boitata", when: () => !set.has("boitata") && set.has("coronel") },
    { role: "cangaceiro", when: () => !set.has("cangaceiro") && set.has("iara") },
    { role: "mula", when: () => !set.has("mula") && set.has("padre") },
  ];

  for (const { role, when } of candidates) {
    if (!when()) continue;
    const out = tryInjectImmuneRole(roles, n, role);
    if (out) return out;
  }

  console.warn("Immune character injection failed: no eligible swap");
  return roles;
}

/** Monta lista final de papéis (sem atribuir a jogadores). */
export function buildResolvedRoles(n: number, rng: () => number): RoleId[] {
  if (n < 5) throw new Error("Mínimo 5 jogadores");

  /** Mesa pequena: 2 moradores especiais + 1 criatura + 1 neutro + aldeões até `targetN`. */
  if (n === 5 || n === 6) {
    const targetN = n;
    const creaturePool = CREATURE_ROLES.filter((r) => r !== "iara" && r !== "mula");
    for (let k = 0; k < 400; k++) {
      const creatures = pickDistinct([...creaturePool], 1, rng);
      const neutrals = pickDistinct([...NEUTRAL_ROLES], 1, rng);
      let roles = closePairDependencies([...TOWN_5, ...creatures, ...neutrals]);
      if (roles.length > targetN) continue;
      while (roles.length < targetN) roles.push("aldeao");
      if (roles.length === targetN && validateRoleComposition(roles)) return roles;
    }
    throw new Error(`Composição ${targetN} jogadores inválida`);
  }

  /** Mesa média: 3 moradores especiais + 2 criaturas + Brás + aldeão(s). */
  if (n === 7 || n === 8) {
    const targetN = n;
    const extraAldeoes = targetN - 7;
    const creaturePool = CREATURE_ROLES.filter((r) => r !== "iara" && r !== "mula");
    for (let k = 0; k < 200; k++) {
      const creatures = pickDistinct([...creaturePool], 2, rng);
      const aldExtra: RoleId[] = Array.from({ length: extraAldeoes }, () => "aldeao");
      const roles: RoleId[] = [...TOWN_7, "aldeao", ...aldExtra, "bras_cubas", ...creatures];
      if (roles.length !== targetN) continue;
      if (validateRoleComposition(roles)) return ensureWolfImmuneTargetSevenPlus(roles, targetN);
    }
    throw new Error(`Composição ${targetN} jogadores inválida`);
  }

  if (n >= 9 && n <= 11) {
    const aldeoes = n - 9;
    const ald: RoleId[] = Array.from({ length: aldeoes }, () => "aldeao");
    const creaturePool = CREATURE_ROLES.filter((r) => r !== "iara" && r !== "mula");
    for (let k = 0; k < 200; k++) {
      const creatures = pickDistinct([...creaturePool], 2, rng);
      const neutrals = neutralsPackForTable(rng, [...TOWN_9_11]);
      const roles = [...TOWN_9_11, ...ald, ...creatures, ...neutrals];
      if (validateRoleComposition(roles)) return ensureWolfImmuneTargetSevenPlus(roles, n);
    }
    throw new Error("Composição 9–11 jogadores inválida");
  }

  for (let k = 0; k < 800; k++) {
    const roles = buildRoles12Plus(n, rng);
    if (roles.length === n && validateRoleComposition(roles)) return ensureWolfImmuneTargetSevenPlus(roles, n);
  }
  throw new Error(`Composição ${n} jogadores inválida (mesa grande)`);
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
