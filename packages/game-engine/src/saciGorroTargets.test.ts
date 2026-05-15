import { describe, expect, it } from "vitest";
import { livingTargetsExcept, pickRandomGorroTarget } from "./saciGorroTargets.js";

describe("livingTargetsExcept", () => {
  const players = [
    { id: "saci", alive: true },
    { id: "a", alive: true },
    { id: "b", alive: false },
    { id: "c", eliminated: true },
    { id: "d", expelled: true },
    { id: "e", alive: true },
  ];

  it("excludes Saci and non-living players", () => {
    const targets = livingTargetsExcept(players, "saci");
    expect(targets.map((p) => p.id)).toEqual(["a", "e"]);
  });
});

describe("pickRandomGorroTarget", () => {
  it("returns null when empty", () => {
    expect(pickRandomGorroTarget([])).toBeNull();
  });

  it("returns an id from the list", () => {
    const targets = [{ id: "only" }];
    expect(pickRandomGorroTarget(targets)).toBe("only");
  });
});
