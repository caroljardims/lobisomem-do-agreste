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

  it("rejeita alvo já investigado (Cartomante)", () => {
    const p = player({ role: "cartomante", side: "morador" });
    const v = validateNightAction(
      { round: 2, expectedRole: "cartomante", priorInvestigationTargetIds: ["x"] },
      p,
      { role: "cartomante", action: "investigate", targetId: "x", specialAction: null },
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

  it("Delegado pode passar sem alvo", () => {
    const p = player({ role: "delegado", side: "morador" });
    const v = validateNightAction(
      { round: 2, expectedRole: "delegado" },
      p,
      { role: "delegado", action: "pass", targetId: null, specialAction: null },
    );
    expect(v.ok).toBe(true);
  });

  it("Delegado não usa lista de investigação antiga — só bloqueia repetir última prisão", () => {
    const p = player({ role: "delegado", side: "morador", delegadoLastJailedId: null });
    const v = validateNightAction(
      { round: 3, expectedRole: "delegado", priorInvestigationTargetIds: ["x"] },
      p,
      { role: "delegado", action: "jail", targetId: "x", specialAction: "motivo" },
    );
    expect(v.ok).toBe(true);
  });

  it("Delegado não pode prender o mesmo alvo da noite anterior", () => {
    const p = player({ role: "delegado", side: "morador", delegadoLastJailedId: "x" });
    const v = validateNightAction(
      { round: 2, expectedRole: "delegado" },
      p,
      { role: "delegado", action: "jail", targetId: "x", specialAction: "motivo válido" },
    );
    expect(v.ok).toBe(false);
  });

  it("Delegado: prisão exige motivo", () => {
    const p = player({ role: "delegado", side: "morador" });
    const v = validateNightAction(
      { round: 2, expectedRole: "delegado" },
      p,
      { role: "delegado", action: "jail", targetId: "x", specialAction: "  " },
    );
    expect(v.ok).toBe(false);
  });

  it("Cartomante não pode passar na 1ª noite", () => {
    const p = player({ role: "cartomante", side: "morador" });
    const v = validateNightAction(
      { round: 1, expectedRole: "cartomante" },
      p,
      { role: "cartomante", action: "pass", targetId: null, specialAction: null },
    );
    expect(v.ok).toBe(false);
  });

  it("Cartomante pode passar a partir da 2ª noite", () => {
    const p = player({ role: "cartomante", side: "morador" });
    const v = validateNightAction(
      { round: 2, expectedRole: "cartomante" },
      p,
      { role: "cartomante", action: "pass", targetId: null, specialAction: null },
    );
    expect(v.ok).toBe(true);
  });

  it("Doutor e Mãe de Santo podem passar", () => {
    const d = player({ role: "doutor", side: "morador" });
    const m = player({ role: "mae_de_santo", side: "morador" });
    expect(
      validateNightAction({ round: 2, expectedRole: "doutor" }, d, {
        role: "doutor",
        action: "pass",
        targetId: null,
        specialAction: null,
      }).ok,
    ).toBe(true);
    expect(
      validateNightAction({ round: 2, expectedRole: "mae_de_santo" }, m, {
        role: "mae_de_santo",
        action: "pass",
        targetId: null,
        specialAction: null,
      }).ok,
    ).toBe(true);
  });

  it("Geni pode passar sem conversar nem charmar", () => {
    const p = player({ role: "geni", side: "morador" });
    const v = validateNightAction(
      { round: 1, expectedRole: "geni" },
      p,
      { role: "geni", action: "pass", targetId: null, specialAction: null },
    );
    expect(v.ok).toBe(true);
  });

  it("Lobisomem não pode usar pass genérico", () => {
    const p = player({ role: "lobisomem", side: "criatura" });
    const v = validateNightAction(
      { round: 1, expectedRole: "lobisomem" },
      p,
      { role: "lobisomem", action: "pass", targetId: null, specialAction: null },
    );
    expect(v.ok).toBe(false);
  });

  it("mesa de 5: Curupira não pode declarar alinhamento com criaturas", () => {
    const p = player({ role: "curupira", side: "neutro" });
    const v = validateNightAction(
      { round: 1, expectedRole: "curupira", tablePlayerCount: 5 },
      p,
      { role: "curupira", action: "protect", targetId: "x", specialAction: "criaturas" },
    );
    expect(v.ok).toBe(false);
  });

  it("mesa de 5: Curupira protege sem escolher alinhamento (fixo com moradores)", () => {
    const p = player({ role: "curupira", side: "neutro" });
    const v = validateNightAction(
      { round: 1, expectedRole: "curupira", tablePlayerCount: 5 },
      p,
      { role: "curupira", action: "protect", targetId: "x", specialAction: null },
    );
    expect(v.ok).toBe(true);
  });

  it("mesa de 5: Curupira pode repetir moradores no payload (ignorado)", () => {
    const p = player({ role: "curupira", side: "neutro" });
    const v = validateNightAction(
      { round: 1, expectedRole: "curupira", tablePlayerCount: 5 },
      p,
      { role: "curupira", action: "protect", targetId: "x", specialAction: "moradores" },
    );
    expect(v.ok).toBe(true);
  });

  it("mesa de 7: Curupira na 1ª noite ainda precisa escolher alinhamento", () => {
    const p = player({ role: "curupira", side: "neutro" });
    const v = validateNightAction(
      { round: 1, expectedRole: "curupira", tablePlayerCount: 7 },
      p,
      { role: "curupira", action: "protect", targetId: "x", specialAction: null },
    );
    expect(v.ok).toBe(false);
  });
});
