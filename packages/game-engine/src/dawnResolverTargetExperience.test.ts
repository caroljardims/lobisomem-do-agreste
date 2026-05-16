import { describe, expect, it } from "vitest";
import { resolveDawn } from "./dawnResolver.js";
import type { GeniInvestigationRecord, PlayerDawnState } from "./types.js";
import { ROLE_SIDE } from "./roles.js";
import {
  TARGET_CURUPIRA_PROTECTED,
  TARGET_INVESTIGATED_OBSERVED,
} from "./dawnTargetExperience.js";

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
    iaraSeductionBlockedThroughRound: null,
  };
}

const NO_ROLE_NAMES =
  /Curupira|Saci|Lobisomem|Mula|Boto|Iara|Doutor|Padre|Delegado|Boitatá|Cartomante|Cangaceiro|Geni|Brás|Aldeão|Coronel|Mãe/i;

function assertNoRoleLeak(msg: string, actorNames: string[]) {
  expect(msg).not.toMatch(NO_ROLE_NAMES);
  for (const n of actorNames) {
    if (n.length >= 2) expect(msg).not.toContain(n);
  }
}

describe("resolveDawn — feedback privado ao alvo (sem vazar autor)", () => {
  it("Curupira: alvo recebe sensação de proteção", () => {
    const cur = basePlayer("c", "AtorCuru", "curupira");
    const v = basePlayer("v", "Vitima", "aldeao");
    const res = resolveDawn({
      round: 1,
      now: 1,
      players: { c: cur, v },
      nightActions: {
        c: { role: "curupira", action: "protect", targetId: "v", specialAction: "moradores" },
      },
      geniInvestigatedIds: {},
    });
    const msg = res.privateLog.v?.map((e) => e.message).join("\n") ?? "";
    expect(msg).toContain("Algo velou por você");
    assertNoRoleLeak(msg, ["AtorCuru"]);
  });

  it("Doutor: alvo recebe mensagem de cura oculta", () => {
    const d = basePlayer("d", "DocSilva", "doutor");
    const v = basePlayer("v", "Vitima", "aldeao");
    const res = resolveDawn({
      round: 1,
      now: 1,
      players: { d, v },
      nightActions: {
        d: { role: "doutor", action: "save", targetId: "v", specialAction: null },
      },
      geniInvestigatedIds: {},
    });
    const msg = res.privateLog.v?.[0]?.message ?? "";
    expect(msg).toContain("mão invisível");
    assertNoRoleLeak(msg, ["DocSilva"]);
  });

  it("Geni Charme: alvo recebe noite boa sem nomear Geni", () => {
    const g = basePlayer("g", "GeniOculta", "geni");
    const v = basePlayer("v", "Vitima", "aldeao");
    const res = resolveDawn({
      round: 1,
      now: 1,
      players: { g, v },
      nightActions: {
        g: { role: "geni", action: "charm", targetId: "v", specialAction: null },
      },
      geniInvestigatedIds: {},
    });
    const msg = res.privateLog.v?.[0]?.message ?? "";
    expect(msg).toContain("estranhamente boa");
    assertNoRoleLeak(msg, ["GeniOculta"]);
  });

  it("Padre: catequizado recebe paz sem nomear Padre", () => {
    const p = basePlayer("p", "PadreOculto", "padre");
    const v = basePlayer("v", "Vitima", "aldeao");
    const res = resolveDawn({
      round: 1,
      now: 1,
      players: { p, v },
      nightActions: {
        p: { role: "padre", action: "catechize", targetId: "v", specialAction: null },
      },
      geniInvestigatedIds: {},
    });
    const msg = res.privateLog.v?.[0]?.message ?? "";
    expect(msg).toContain("paz incomum");
    assertNoRoleLeak(msg, ["PadreOculto"]);
  });

  it("Lobisomem em alvo protegido: alvo sente perigo que não chegou; lobo não recebe mensagem", () => {
    const w = basePlayer("w", "LoboX", "lobisomem");
    const d = basePlayer("d", "DocY", "doutor");
    const v = basePlayer("v", "Vitima", "aldeao");
    const res = resolveDawn({
      round: 1,
      now: 1,
      players: { w, d, v },
      nightActions: {
        d: { role: "doutor", action: "save", targetId: "v", specialAction: null },
        w: { role: "lobisomem", action: "eliminate", targetId: "v", specialAction: null },
      },
      geniInvestigatedIds: {},
    });
    const vmsg = res.privateLog.v?.find((e) => e.message.includes("perigo passou perto"))?.message ?? "";
    expect(vmsg.length).toBeGreaterThan(10);
    assertNoRoleLeak(vmsg, ["LoboX", "DocY"]);
    expect(res.privateLog.w?.length ?? 0).toBe(0);
  });

  it("Mula terror falhou: alvo protegido recebe barulho distante", () => {
    const c = basePlayer("c", "CurX", "curupira");
    const m = basePlayer("m", "MulaX", "mula");
    const v = basePlayer("v", "Vitima", "aldeao");
    const res = resolveDawn({
      round: 2,
      now: 1,
      players: { c, m, v },
      nightActions: {
        c: { role: "curupira", action: "protect", targetId: "v", specialAction: "moradores" },
        m: { role: "mula", action: "terrorize", targetId: "v", specialAction: null },
      },
      geniInvestigatedIds: {},
    });
    const msg = res.privateLog.v?.find((e) => e.message.includes("Bucaré te protegeu"))?.message ?? "";
    expect(msg.length).toBeGreaterThan(10);
    assertNoRoleLeak(msg, ["MulaX", "CurX"]);
  });

  it("Boto enchant falhou: alvo sonhou mas sonho não ficou", () => {
    const c = basePlayer("c", "CurX", "curupira");
    const b = basePlayer("b", "BotoX", "boto");
    const v = basePlayer("v", "Vitima", "aldeao");
    const res = resolveDawn({
      round: 1,
      now: 1,
      players: { c, b, v },
      nightActions: {
        c: { role: "curupira", action: "protect", targetId: "v", specialAction: "moradores" },
        b: { role: "boto", action: "enchant", targetId: "v", specialAction: null },
      },
      geniInvestigatedIds: {},
    });
    const msg = res.privateLog.v?.find((e) => e.message.includes("sonho não ficou"))?.message ?? "";
    expect(msg.length).toBeGreaterThan(10);
    assertNoRoleLeak(msg, ["BotoX"]);
  });

  it("Iara seduce falhou: alvo ouve voz do rio mas fica firme", () => {
    const p = basePlayer("p", "PadreX", "padre");
    const i = basePlayer("i", "IaraX", "iara");
    const v = basePlayer("v", "Vitima", "aldeao");
    const res = resolveDawn({
      round: 1,
      now: 1,
      players: { p, i, v },
      nightActions: {
        p: { role: "padre", action: "catechize", targetId: "v", specialAction: null },
        i: { role: "iara", action: "seduce", targetId: "v", specialAction: null },
      },
      geniInvestigatedIds: {},
    });
    const msg = res.privateLog.v?.find((e) => e.message.includes("voz tentou te chamar"))?.message ?? "";
    expect(msg.length).toBeGreaterThan(10);
    assertNoRoleLeak(msg, ["IaraX", "PadreX"]);
  });

  it("Saci roubo falhou em protegido: redemoinho não entrou", () => {
    const c = basePlayer("c", "CurX", "curupira");
    const s = basePlayer("s", "SaciX", "saci");
    const v = basePlayer("v", "Vitima", "aldeao");
    const res = resolveDawn({
      round: 1,
      now: 1,
      players: { c, s, v },
      nightActions: {
        c: { role: "curupira", action: "protect", targetId: "v", specialAction: "moradores" },
        s: { role: "saci", action: "steal", targetId: "v", specialAction: null },
      },
      geniInvestigatedIds: {},
    });
    const msg = res.privateLog.v?.find((e) => e.message.includes("não entrou"))?.message ?? "";
    expect(msg.length).toBeGreaterThan(10);
    assertNoRoleLeak(msg, ["SaciX"]);
  });

  it("Saci roubo com sucesso: vítima sente redemoinho e perda", () => {
    const s = basePlayer("s", "SaciX", "saci");
    const v = basePlayer("v", "Vitima", "aldeao");
    const res = resolveDawn({
      round: 1,
      now: 1,
      players: { s, v },
      nightActions: {
        s: { role: "saci", action: "steal", targetId: "v", specialAction: null },
      },
      geniInvestigatedIds: {},
    });
    const msg = res.privateLog.v?.find((e) => e.message.includes("redemoinho passou"))?.message ?? "";
    expect(msg.length).toBeGreaterThan(10);
    assertNoRoleLeak(msg, ["SaciX"]);
  });

  it("Boto enchant com sucesso: alvo sonho vívido", () => {
    const b = basePlayer("b", "BotoX", "boto");
    const v = basePlayer("v", "Vitima", "aldeao");
    const res = resolveDawn({
      round: 1,
      now: 1,
      players: { b, v },
      nightActions: {
        b: { role: "boto", action: "enchant", targetId: "v", specialAction: null },
      },
      geniInvestigatedIds: {},
    });
    const msg = res.privateLog.v?.find((e) => e.message.includes("sonho"))?.message ?? "";
    expect(msg).toContain("vívido");
    assertNoRoleLeak(msg, ["BotoX"]);
  });

  it("Iara seduce com sucesso: voz d'água", () => {
    const i = basePlayer("i", "IaraX", "iara");
    const v = basePlayer("v", "Vitima", "aldeao");
    const res = resolveDawn({
      round: 1,
      now: 1,
      players: { i, v },
      nightActions: {
        i: { role: "iara", action: "seduce", targetId: "v", specialAction: null },
      },
      geniInvestigatedIds: {},
    });
    const msg = res.privateLog.v?.find((e) => e.message.includes("voz d'água"))?.message ?? "";
    expect(msg.length).toBeGreaterThan(10);
    assertNoRoleLeak(msg, ["IaraX"]);
  });

  it("Mula terror com sucesso: alvo recebe detalhe privado além do público", () => {
    const m = basePlayer("m", "MulaX", "mula");
    const v = basePlayer("v", "Vitima", "aldeao");
    const res = resolveDawn({
      round: 1,
      now: 1,
      players: { m, v },
      nightActions: {
        m: { role: "mula", action: "terrorize", targetId: "v", specialAction: null },
      },
      geniInvestigatedIds: {},
    });
    const msg = res.privateLog.v?.find((e) => e.message.includes("sem cabeça"))?.message ?? "";
    expect(msg.length).toBeGreaterThan(10);
    assertNoRoleLeak(msg, ["MulaX"]);
    expect(res.publicLog.some((e) => e.type === "terror")).toBe(true);
  });

  it("Delegado: preso recebe lei de Bucaré", () => {
    const d = basePlayer("d", "DelX", "delegado");
    const v = basePlayer("v", "Vitima", "aldeao");
    const res = resolveDawn({
      round: 1,
      now: 1,
      players: { d, v },
      nightActions: {
        d: {
          role: "delegado",
          action: "jail",
          targetId: "v",
          specialAction: "suspeita",
        },
      },
      geniInvestigatedIds: {},
    });
    const msg = res.privateLog.v?.find((e) => e.message.includes("braços longos"))?.message ?? "";
    expect(msg.length).toBeGreaterThan(10);
    assertNoRoleLeak(msg, ["DelX"]);
  });

  it("Geni converse em não-Cangaceiro: alvo foi ouvido", () => {
    const g = basePlayer("g", "GeniX", "geni");
    const a = basePlayer("a", "Ana", "aldeao");
    const res = resolveDawn({
      round: 1,
      now: 1,
      players: { g, a },
      nightActions: {
        g: { role: "geni", action: "converse", targetId: "a", specialAction: null },
      },
      geniInvestigatedIds: { g: [{ playerId: "a", round: 1, result: "morador" } satisfies GeniInvestigationRecord] },
    });
    const msg = res.privateLog.a?.find((e) => e.message.includes("foi ouvido"))?.message ?? "";
    expect(msg.length).toBeGreaterThan(10);
    assertNoRoleLeak(msg, ["GeniX"]);
  });

  it("Romance da Caatinga: exceção — mensagem ao Cangaceiro ainda nomeia Geni", () => {
    const g = basePlayer("g", "GeniX", "geni");
    const c = basePlayer("c", "Zé", "cangaceiro");
    const prior: GeniInvestigationRecord[] = [
      { playerId: "w", round: 1, result: "morador" },
    ];
    const players = {
      g,
      c,
      w: basePlayer("w", "Lobo", "lobisomem"),
    };
    const res = resolveDawn({
      round: 2,
      now: 1,
      players,
      nightActions: {
        g: { role: "geni", action: "converse", targetId: "c", specialAction: null },
      },
      geniInvestigatedIds: { g: prior },
    });
    const romance = res.privateLog.c?.find((e) => e.message.includes("passou a noite com você"));
    expect(romance?.message).toContain("Geni");
  });

  it("Cartomante: alvo recebe observação antes da mensagem do ator (fila alvos → atores)", () => {
    const cur = basePlayer("c", "CurNome", "curupira");
    const cart = basePlayer("t", "CartNome", "cartomante");
    const v = basePlayer("v", "Vitima", "aldeao");
    const res = resolveDawn({
      round: 1,
      now: 1,
      players: { c: cur, t: cart, v },
      nightActions: {
        c: { role: "curupira", action: "protect", targetId: "v", specialAction: "moradores" },
        t: { role: "cartomante", action: "investigate", targetId: "v", specialAction: null },
      },
      geniInvestigatedIds: {},
    });
    const vMsgs = res.privateLog.v ?? [];
    expect(vMsgs[0]?.message).toContain(TARGET_CURUPIRA_PROTECTED.slice(0, 20));
    expect(vMsgs.some((e) => e.message.includes(TARGET_INVESTIGATED_OBSERVED.slice(0, 25)))).toBe(true);
    const cartMsgs = res.privateLog.t ?? [];
    expect(cartMsgs[0]?.message).toContain("Sua investigação");
  });
});
