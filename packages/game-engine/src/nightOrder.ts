import type { RoleId } from "./types.js";

/** Ordem de ação noturna (CLAUDE.md — Fase da noite). */
export const NIGHT_ACTION_ORDER: RoleId[] = [
  "lobisomem",
  "saci",
  "mula",
  "boto",
  "iara",
  "curupira",
  "doutor",
  "mae_de_santo",
  "geni",
  "boitata",
  "cartomante",
  "delegado",
  "cangaceiro",
];

/** Papéis ativos na noite (presentes na ordem e vivos / na partida). */
export function rolesPresentInRoom(rolesInGame: Set<RoleId>): RoleId[] {
  return NIGHT_ACTION_ORDER.filter((r) => rolesInGame.has(r));
}

export function nextNightRoleIndex(
  order: RoleId[],
  fromIndex: number,
  alivePlayerByRole: Map<RoleId, string | undefined>,
): { index: number; role: RoleId | null } {
  for (let i = fromIndex; i < order.length; i++) {
    const role = order[i];
    if (alivePlayerByRole.get(role)) return { index: i, role };
  }
  return { index: order.length, role: null };
}
