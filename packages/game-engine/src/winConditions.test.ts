import { describe, expect, it } from "vitest";
import {
  checkCollectiveWin,
  checkCollectiveWinDetailed,
  collectiveWinChronicleMessagePt,
} from "./winConditions.js";
import type { WinPlayerSnapshot } from "./winConditions.js";

function snap(id: string, role: WinPlayerSnapshot["role"], opts: Partial<WinPlayerSnapshot> = {}): WinPlayerSnapshot {
  return { id, role, alive: true, eliminated: false, expelled: false, individualObjectiveMet: false, ...opts };
}

describe("checkCollectiveWin", () => {
  const t5 = 5;
  const t7 = 7;

  it("retorna null quando jogo deve continuar — pendingNightStart deve ser setado", () => {
    const players = {
      w: snap("w", "lobisomem"),
      a: snap("a", "aldeao"),
      d: snap("d", "doutor"),
    };
    expect(checkCollectiveWin(players, 2, 7, t5)).toBeNull();
  });

  it("retorna null após expulsão de morador sem alterar equilíbrio decisivo — pendingNightStart deve ser setado", () => {
    const players = {
      w: snap("w", "lobisomem"),
      a: snap("a", "aldeao", { alive: false, expelled: true }),
      d: snap("d", "doutor"),
      c: snap("c", "cartomante"),
    };
    expect(checkCollectiveWin(players, 1, 7, t5)).toBeNull();
  });

  it("retorna null quando empate no placar em mesa 5–6 (criaturas não > moradores)", () => {
    const players = {
      w: snap("w", "lobisomem"),
      a: snap("a", "aldeao"),
      d: snap("d", "doutor"),
    };
    expect(checkCollectiveWin(players, 2, 7, t5)).toBeNull();
  });

  it("retorna 'moradores' quando todas as criaturas são eliminadas", () => {
    const players = {
      w: snap("w", "lobisomem", { alive: false, eliminated: true }),
      a: snap("a", "aldeao"),
    };
    expect(checkCollectiveWin(players, 1, 7, t5)).toBe("moradores");
  });

  it("retorna 'criaturas' quando criaturas > moradores (mesa 5)", () => {
    const players = {
      w: snap("w", "lobisomem"),
      s: snap("s", "saci"),
      a: snap("a", "aldeao"),
    };
    expect(checkCollectiveWin(players, 1, 7, t5)).toBe("criaturas");
  });

  it("retorna 'criaturas' quando só o lobisomem sobrevive (0 moradores vivos)", () => {
    const players = {
      w: snap("w", "lobisomem"),
      a: snap("a", "aldeao", { alive: false, eliminated: true }),
      d: snap("d", "doutor", { alive: false, eliminated: true }),
    };
    expect(checkCollectiveWin(players, 2, 7, t5)).toBe("criaturas");
  });

  it("mesa 5–6: empate 1 criatura vs 1 morador alinhado (Curupira moradores) não dá vitória por placar", () => {
    const players = {
      w: snap("w", "lobisomem"),
      c: snap("c", "curupira", { alignment: "moradores" }),
    };
    expect(checkCollectiveWin(players, 1, 7, t5)).toBeNull();
  });

  it("Brás Cubas não infla o contador de moradores no limiar", () => {
    const players = {
      w: snap("w", "lobisomem"),
      b: snap("b", "bras_cubas", { alignment: "moradores" }),
    };
    expect(checkCollectiveWin(players, 1, 7, t5)).toBe("criaturas");
  });

  it("retorna 'criaturas' por objetivos individuais sem exigir Saci (sem objetivo rastreado)", () => {
    const players = {
      w: snap("w", "lobisomem", { individualObjectiveMet: true }),
      s: snap("s", "saci", { individualObjectiveMet: false }),
      a: snap("a", "aldeao"),
      d: snap("d", "doutor"),
      c: snap("c", "cartomante"),
    };
    expect(checkCollectiveWin(players, 1, 7, t5)).toBe("criaturas");
  });

  it("não encerra por objetivos quando a única criatura viva é o Saci (sem objetivo rastreado no engine)", () => {
    const players = {
      s: snap("s", "saci", { individualObjectiveMet: false }),
      a: snap("a", "aldeao"),
      d: snap("d", "doutor"),
      m: snap("m", "delegado"),
      b: snap("b", "bras_cubas"),
    };
    expect(checkCollectiveWin(players, 1, 7, t7)).toBeNull();
    const detail = checkCollectiveWinDetailed(players, 1, 7, t7);
    expect(detail.reason).toBeNull();
  });

  it("mesa 7+: empate numérico criaturas === moradores favorece moradores (praça)", () => {
    const players = {
      w: snap("w", "lobisomem"),
      s: snap("s", "saci"),
      a: snap("a", "aldeao"),
      d: snap("d", "doutor"),
    };
    const detail = checkCollectiveWinDetailed(players, 1, 7, t7);
    expect(detail.winner).toBe("moradores");
    expect(detail.reason).toBe("moradores_plaza_tie");
    const msg = collectiveWinChronicleMessagePt(detail);
    expect(msg).toContain("empate");
    expect(msg).toContain("moradores venceram");
  });

  it("mesa 7+: criaturas > moradores ainda vencem as criaturas", () => {
    const players = {
      w: snap("w", "lobisomem"),
      s: snap("s", "saci"),
      a: snap("a", "aldeao"),
    };
    const d = checkCollectiveWinDetailed(players, 1, 7, t7);
    expect(d.reason).toBe("creatures_strict_majority");
    const msg = collectiveWinChronicleMessagePt(d);
    expect(msg).toContain("folclore");
    expect(msg).toContain("Vitória das criaturas");
  });
});
