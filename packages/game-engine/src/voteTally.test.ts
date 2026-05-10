import { describe, expect, it } from "vitest";
import { tallyExpulsionVotes } from "./voteTally.js";

describe("tallyExpulsionVotes", () => {
  it("picks single leader", () => {
    const r = tallyExpulsionVotes(
      [
        { voterId: "a", targetId: "x" },
        { voterId: "b", targetId: "x" },
        { voterId: "c", targetId: "y" },
      ],
      {},
    );
    expect(r.expelledId).toBe("x");
  });

  it("empate sem expulsão", () => {
    const r = tallyExpulsionVotes(
      [
        { voterId: "a", targetId: "x" },
        { voterId: "b", targetId: "y" },
      ],
      {},
    );
    expect(r.expelledId).toBeNull();
  });

  it("peso duplo em Brás", () => {
    const r = tallyExpulsionVotes(
      [
        { voterId: "a", targetId: "bras" },
        { voterId: "b", targetId: "x" },
      ],
      { doubleVotesOnBras: true, brasPlayerId: "bras" },
    );
    expect(r.expelledId).toBe("bras");
  });
});
