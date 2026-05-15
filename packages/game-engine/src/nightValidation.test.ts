import { describe, expect, it } from "vitest";
import { validateNightAction } from "./nightValidation.js";
import type { PlayerDawnState } from "./types.js";

function player(over: Partial<PlayerDawnState> = {}): PlayerDawnState {
  return {
    id: "p1",
    name: "A",
    role: "lobisomem",
    side: "criatura",
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
    ...over,
  };
}

describe("validateNightAction", () => {
  it("rejeita segunda mordida do Lobisomem", () => {
    const p = player({ wolfBiteUsed: true });
    const v = validateNightAction(
      { round: 2, expectedRole: "lobisomem" },
      p,
      { role: "lobisomem", action: "bite", targetId: "x", specialAction: null },
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain("Morder");
  });

  it("permite morder quando ainda não foi usado", () => {
    const p = player({ wolfBiteUsed: false });
    const v = validateNightAction(
      { round: 1, expectedRole: "lobisomem" },
      p,
      { role: "lobisomem", action: "bite", targetId: "x", specialAction: null },
    );
    expect(v.ok).toBe(true);
  });

  it("rejeita segundo Exorcismo da Mula", () => {
    const p = player({ role: "mula", side: "criatura", mulaExorcizeUsed: true });
    const v = validateNightAction(
      { round: 2, expectedRole: "mula" },
      p,
      { role: "mula", action: "exorcize", targetId: "x", specialAction: null },
    );
    expect(v.ok).toBe(false);
  });

  it("rejeita segundo Charme da Geni", () => {
    const p = player({ role: "geni", side: "morador", geniCharmUsed: true });
    const v = validateNightAction(
      { round: 2, expectedRole: "geni" },
      p,
      { role: "geni", action: "charm", targetId: "x", specialAction: null },
    );
    expect(v.ok).toBe(false);
  });

  it("bloqueia sedução da Iara enquanto cooldown da Voz ativo", () => {
    const p = player({
      role: "iara",
      side: "criatura",
      iaraSeductionBlockedThroughRound: 3,
    });
    const v = validateNightAction(
      { round: 2, expectedRole: "iara" },
      p,
      { role: "iara", action: "seduce", targetId: "x", specialAction: null },
    );
    expect(v.ok).toBe(false);
  });

  it("permite sedução da Iara após cooldown", () => {
    const p = player({
      role: "iara",
      side: "criatura",
      iaraSeductionBlockedThroughRound: 3,
    });
    const v = validateNightAction(
      { round: 4, expectedRole: "iara" },
      p,
      { role: "iara", action: "seduce", targetId: "x", specialAction: null },
    );
    expect(v.ok).toBe(true);
  });
});
