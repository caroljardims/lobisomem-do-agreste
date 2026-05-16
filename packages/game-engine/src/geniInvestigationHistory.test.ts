import { describe, expect, it } from "vitest";
import {
  geniConversedPlayerIds,
  geniInvestigationsPriorToRound,
  geniKnowsTargetForDayTiro,
  normalizeGeniInvestigatedTargets,
} from "./geniInvestigationHistory.js";

describe("normalizeGeniInvestigatedTargets", () => {
  it("maps legacy string ids to round 0", () => {
    const r = normalizeGeniInvestigatedTargets(["a", "b"]);
    expect(r).toEqual([
      { playerId: "a", round: 0, result: "morador" },
      { playerId: "b", round: 0, result: "morador" },
    ]);
  });

  it("accepts object entries", () => {
    const r = normalizeGeniInvestigatedTargets([
      { playerId: "x", round: 2, result: "criatura" },
      { playerId: "y", round: 3, result: "morador" },
    ]);
    expect(r).toEqual([
      { playerId: "x", round: 2, result: "criatura" },
      { playerId: "y", round: 3, result: "morador" },
    ]);
  });

  it("ignores malformed entries and trims ids", () => {
    const r = normalizeGeniInvestigatedTargets([
      "  z  ",
      {},
      { playerId: "" },
      { playerId: "ok", round: "oops" as unknown as number, result: "criatura" },
    ]);
    expect(r).toEqual([
      { playerId: "z", round: 0, result: "morador" },
      { playerId: "ok", round: 0, result: "criatura" },
    ]);
  });

  it("defaults invalid result to morador", () => {
    const r = normalizeGeniInvestigatedTargets([{ playerId: "p", round: 1, result: "neutro" as never }]);
    expect(r[0]?.result).toBe("morador");
  });
});

describe("geniInvestigationsPriorToRound", () => {
  it("excludes current round", () => {
    const all = [
      { playerId: "a", round: 2, result: "morador" as const },
      { playerId: "b", round: 3, result: "morador" as const },
    ];
    expect(geniInvestigationsPriorToRound(all, 3)).toEqual([{ playerId: "a", round: 2, result: "morador" }]);
  });
});

describe("geniKnowsTargetForDayTiro", () => {
  it("includes same round during day check", () => {
    const all = [{ playerId: "a", round: 3, result: "morador" as const }];
    expect(geniKnowsTargetForDayTiro(all, "a", 3)).toBe(true);
    expect(geniKnowsTargetForDayTiro(all, "a", 2)).toBe(false);
  });
});

describe("geniConversedPlayerIds", () => {
  it("dedupes by playerId", () => {
    expect(
      geniConversedPlayerIds([
        { playerId: "a", round: 1, result: "morador" },
        { playerId: "a", round: 2, result: "morador" },
      ]).sort(),
    ).toEqual(["a"]);
  });
});
