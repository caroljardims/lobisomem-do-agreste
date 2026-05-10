import { describe, expect, it } from "vitest";
import { buildResolvedRoles, dealRoles, validateRoleComposition } from "./rolePools.js";

function rngFixed(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

describe("rolePools", () => {
  it("builds 5 players with valid composition", () => {
    const roles = buildResolvedRoles(5, rngFixed(42));
    expect(roles).toHaveLength(5);
    expect(validateRoleComposition(roles)).toBe(true);
  });

  it("deals 7 players", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const deal = dealRoles(ids, rngFixed(7));
    expect(Object.keys(deal.byPlayerId)).toHaveLength(7);
    expect(ids.includes(deal.spokespersonId)).toBe(true);
  });
});
