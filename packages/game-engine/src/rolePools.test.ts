import { describe, expect, it } from "vitest";
import { CREATURE_ROLES, ROLE_SIDE } from "./roles.js";
import {
  buildResolvedRoles,
  dealRoles,
  maxRoundsForPlayerCount,
  poolHasLobisomemImmuneTarget,
  validateRoleComposition,
} from "./rolePools.js";

function rngFixed(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

describe("rolePools", () => {
  it("builds 5 players: 1 criatura, 1 neutro, 3 moradores; composição válida", () => {
    for (let seed = 0; seed < 80; seed++) {
      const roles = buildResolvedRoles(5, rngFixed(seed));
      expect(roles).toHaveLength(5);
      expect(validateRoleComposition(roles)).toBe(true);
      const criaturas = roles.filter((r) => ROLE_SIDE[r] === "criatura");
      const neutros = roles.filter((r) => ROLE_SIDE[r] === "neutro");
      const moradores = roles.filter((r) => ROLE_SIDE[r] === "morador");
      expect(criaturas).toHaveLength(1);
      expect(neutros).toHaveLength(1);
      expect(moradores).toHaveLength(3);
      expect(criaturas.every((r) => CREATURE_ROLES.includes(r))).toBe(true);
    }
  });

  it("builds 12 players with valid composition", () => {
    for (let seed = 0; seed < 100; seed++) {
      const roles = buildResolvedRoles(12, rngFixed(seed));
      expect(roles).toHaveLength(12);
      expect(validateRoleComposition(roles)).toBe(true);
    }
  });

  it("composição: Padre pode existir sem Mula; Mula exige Padre", () => {
    expect(validateRoleComposition(["delegado", "doutor", "aldeao", "lobisomem", "padre"])).toBe(true);
    expect(validateRoleComposition(["delegado", "doutor", "aldeao", "mula", "bras_cubas"])).toBe(false);
  });

  it("mesa de 5 jogadores: até 7 rodadas antes da lua cheia", () => {
    expect(maxRoundsForPlayerCount(5)).toBe(7);
    expect(maxRoundsForPlayerCount(6)).toBe(7);
    expect(maxRoundsForPlayerCount(7)).toBe(5);
    expect(maxRoundsForPlayerCount(8)).toBe(5);
  });

  it("builds 6 players (regra do 5 + 1 aldeão)", () => {
    for (let seed = 0; seed < 80; seed++) {
      const roles = buildResolvedRoles(6, rngFixed(seed));
      expect(roles).toHaveLength(6);
      expect(validateRoleComposition(roles)).toBe(true);
    }
  });

  it("builds 8 players (regra do 7 + 1 aldeão)", () => {
    for (let seed = 0; seed < 80; seed++) {
      const roles = buildResolvedRoles(8, rngFixed(seed));
      expect(roles).toHaveLength(8);
      expect(validateRoleComposition(roles)).toBe(true);
    }
  });

  it("builds mesas grandes 12–24 sem falhar", () => {
    for (const n of [12, 13, 14, 16, 20, 24]) {
      for (let seed = 0; seed < 40; seed++) {
        const roles = buildResolvedRoles(n, rngFixed(seed + n));
        expect(roles).toHaveLength(n);
        expect(validateRoleComposition(roles)).toBe(true);
      }
    }
  });

  it("deals 7 players", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const deal = dealRoles(ids, rngFixed(7));
    expect(Object.keys(deal.byPlayerId)).toHaveLength(7);
    expect(ids.includes(deal.spokespersonId)).toBe(true);
  });

  it("mesa 7+: pool sempre inclui alvo imune ao Lobisomem", () => {
    for (const n of [7, 8, 9, 10, 11, 12, 16, 20]) {
      for (let seed = 0; seed < 80; seed++) {
        const roles = buildResolvedRoles(n, rngFixed(seed + n * 1000));
        expect(poolHasLobisomemImmuneTarget(roles)).toBe(true);
      }
    }
  });
});
