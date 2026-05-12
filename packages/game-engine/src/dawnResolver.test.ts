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

  it("Mula exorcismo elimina Padre e registra vitória individual", () => {
    const mula = basePlayer("m", "Mula", "mula");
    const padre = basePlayer("p", "Padre", "padre");
    const aldeao = basePlayer("a", "Aldeao", "aldeao");
    const players = { m: mula, p: padre, a: aldeao };
    const res = resolveDawn({
      round: 2,
      now: 1,
      players,
      nightActions: {
        m: { role: "mula", action: "exorcize", targetId: "p", specialAction: null },
      },
      geniInvestigatedIds: {},
    });
    expect(res.players.p.alive).toBe(false);
    expect(res.players.p.eliminated).toBe(true);
    expect(res.publicLog.some((e) => e.type === "death")).toBe(true);
    expect(res.individualWins.some((w) => w.role === "mula" && w.type === "mula_padre")).toBe(true);
  });

  it("Mula exorcismo falha se alvo estiver protegido (Curupira)", () => {
    const mula = basePlayer("m", "Mula", "mula");
    const curupira = basePlayer("c", "Curupira", "curupira");
    const padre = basePlayer("p", "Padre", "padre");
    const players = { m: mula, c: curupira, p: padre };
    const res = resolveDawn({
      round: 2,
      now: 1,
      players,
      nightActions: {
        c: { role: "curupira", action: "protect", targetId: "p", specialAction: null },
        m: { role: "mula", action: "exorcize", targetId: "p", specialAction: null },
      },
      geniInvestigatedIds: {},
    });
    expect(res.players.p.alive).toBe(true);
    expect(res.individualWins.some((w) => w.role === "mula")).toBe(false);
  });

  it("Geni Charme de Verdade protege alvo do Lobisomem", () => {
    const geni = basePlayer("g", "Geni", "geni");
    const wolf = basePlayer("w", "Wolf", "lobisomem");
    const alvo = basePlayer("a", "Alvo", "aldeao");
    const players = { g: geni, w: wolf, a: alvo };
    const res = resolveDawn({
      round: 1,
      now: 1,
      players,
      nightActions: {
        g: { role: "geni", action: "charm", targetId: "a", specialAction: null },
        w: { role: "lobisomem", action: "eliminate", targetId: "a", specialAction: null },
      },
      geniInvestigatedIds: {},
    });
    expect(res.players.a.alive).toBe(true);
    expect(res.publicLog.some((e) => e.type === "death")).toBe(false);
  });

  it("Romance da Caatinga: Geni em converse no Cangaceiro envia histórico completo ao Cangaceiro", () => {
    const geni = basePlayer("g", "Geni", "geni");
    const cang = basePlayer("c", "Zé", "cangaceiro");
    const aldeao = basePlayer("a", "Ana", "aldeao");
    const wolf = basePlayer("w", "Lobo", "lobisomem");
    const players = { g: geni, c: cang, a: aldeao, w: wolf };
    const res = resolveDawn({
      round: 2,
      now: 1,
      players,
      nightActions: {
        g: { role: "geni", action: "converse", targetId: "c", specialAction: null },
      },
      geniInvestigatedIds: { g: ["a", "w", "c"] },
    });
    const romance = res.privateLog.c?.find((e) => e.message.includes("passou a noite com você"));
    expect(romance?.message).toContain("Geni passou a noite com você");
    expect(romance?.message).toContain("Ana (morador)");
    expect(romance?.message).toContain("Lobo (criatura)");
    expect(romance?.message).toContain("Zé (morador)");
  });

  it("Romance da Caatinga não dispara com charm no Cangaceiro", () => {
    const geni = basePlayer("g", "Geni", "geni");
    const cang = basePlayer("c", "Zé", "cangaceiro");
    const players = { g: geni, c: cang };
    const res = resolveDawn({
      round: 1,
      now: 1,
      players,
      nightActions: {
        g: { role: "geni", action: "charm", targetId: "c", specialAction: null },
      },
      geniInvestigatedIds: { g: ["a"] },
    });
    expect(res.privateLog.c?.some((e) => e.message.includes("passou a noite com você"))).toBeFalsy();
  });

  it("Romance da Caatinga não dispara quando Geni conversa com outro alvo", () => {
    const geni = basePlayer("g", "Geni", "geni");
    const cang = basePlayer("c", "Zé", "cangaceiro");
    const aldeao = basePlayer("a", "Ana", "aldeao");
    const players = { g: geni, c: cang, a: aldeao };
    const res = resolveDawn({
      round: 1,
      now: 1,
      players,
      nightActions: {
        g: { role: "geni", action: "converse", targetId: "a", specialAction: null },
      },
      geniInvestigatedIds: { g: ["a"] },
    });
    expect(res.privateLog.c?.some((e) => e.message.includes("passou a noite com você"))).toBeFalsy();
  });

  it("Cangaceiro pass não bloqueia Geni", () => {
    const geni = basePlayer("g", "Geni", "geni");
    const cang = basePlayer("c", "Zé", "cangaceiro");
    const players = { g: geni, c: cang };
    const res = resolveDawn({
      round: 1,
      now: 1,
      players,
      nightActions: {
        c: { role: "cangaceiro", action: "pass", targetId: null, specialAction: null },
      },
      geniInvestigatedIds: { g: [] },
    });
    expect(res.players.g.blockedNextNight).toBe(false);
  });

  it("Cangaceiro query sem investigação da Geni bloqueia Geni na próxima noite", () => {
    const geni = basePlayer("g", "Geni", "geni");
    const cang = basePlayer("c", "Zé", "cangaceiro");
    const aldeao = basePlayer("a", "Ana", "aldeao");
    const players = { g: geni, c: cang, a: aldeao };
    const res = resolveDawn({
      round: 1,
      now: 1,
      players,
      nightActions: {
        c: { role: "cangaceiro", action: "query", targetId: "a", specialAction: null },
      },
      geniInvestigatedIds: { g: [] },
    });
    expect(res.players.g.blockedNextNight).toBe(true);
  });
});
