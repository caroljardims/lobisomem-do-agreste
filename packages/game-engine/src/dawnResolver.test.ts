import { describe, expect, it } from "vitest";
import { resolveDawn } from "./dawnResolver.js";
import type { PlayerDawnState } from "./types.js";
import { ROLE_SIDE } from "./roles.js";

function basePlayer(
  id: string,
  name: string,
  role: import("./types.js").RoleId,
): PlayerDawnState {
  return {
    id,
    name,
    role,
    side: ROLE_SIDE[role],
    alive: true,
    eliminated: false,
    expelled: false,
    blockedNextNight: false,
    silenced: false,
    silencedRounds: 0,
    enchanted: false,
    seduced: false,
    jailed: false,
    protected: false,
    invoked: false,
    doctorLastTargetId: null,
    wolfBiteUsed: false,
    mulaExorcizeUsed: false,
    geniCharmUsed: false,
    catechized: false,
  };
}

describe("resolveDawn", () => {
  it("applies Cartomante inversion vs Curupira", () => {
    const p1 = basePlayer("p1", "Ana", "cartomante");
    const p2 = basePlayer("p2", "Beto", "curupira");
    const players = { p1, p2 };
    const res = resolveDawn({
      round: 1,
      now: 1,
      players,
      nightActions: {
        p1: { role: "cartomante", action: "investigate", targetId: "p2", specialAction: null },
      },
      geniInvestigatedIds: {},
    });
    const msg = res.privateLog.p1?.[0]?.message ?? "";
    expect(msg).toContain("criatura");
  });

  it("blocks wolf kill when doctor saves same target", () => {
    const wolf = basePlayer("w", "W", "lobisomem");
    const doc = basePlayer("d", "D", "doutor");
    const vic = basePlayer("v", "V", "aldeao");
    const players = { w: wolf, d: doc, v: vic };
    const res = resolveDawn({
      round: 1,
      now: 1,
      players,
      nightActions: {
        w: { role: "lobisomem", action: "eliminate", targetId: "v", specialAction: null },
        d: { role: "doutor", action: "save", targetId: "v", specialAction: null },
      },
      geniInvestigatedIds: {},
    });
    expect(res.players.v.alive).toBe(true);
    expect(res.publicLog.some((e) => e.type === "death")).toBe(false);
  });
});
