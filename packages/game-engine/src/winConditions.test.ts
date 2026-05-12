import { describe, expect, it } from "vitest";
import { checkCollectiveWin } from "./winConditions.js";
import type { WinPlayerSnapshot } from "./winConditions.js";

function snap(id: string, role: WinPlayerSnapshot["role"], opts: Partial<WinPlayerSnapshot> = {}): WinPlayerSnapshot {
  return { id, role, alive: true, eliminated: false, expelled: false, individualObjectiveMet: false, ...opts };
}

describe("checkCollectiveWin", () => {
  it("retorna null quando jogo deve continuar — pendingNightStart deve ser setado", () => {
    // Cenário: lobisomem vivo, 2 moradores vivos → criaturas < moradores → jogo continua
    // Este é o caminho que dispara pendingNightStart: true no finalizeDay
    const players = {
      w: snap("w", "lobisomem"),
      a: snap("a", "aldeao"),
      d: snap("d", "doutor"),
    };
    expect(checkCollectiveWin(players, 2, 5)).toBeNull();
  });

  it("retorna null após expulsão de morador sem alterar equilíbrio decisivo — pendingNightStart deve ser setado", () => {
    // Aldeão expulso: lobisomem + 2 moradores restam → criaturas(1) < moradores(2) → jogo continua
    // O finalizeDay deve setar pendingNightStart:true (não pode auto-iniciar a noite sem o host)
    const players = {
      w: snap("w", "lobisomem"),
      a: snap("a", "aldeao", { alive: false, expelled: true }),
      d: snap("d", "doutor"),
      c: snap("c", "cartomante"),
    };
    expect(checkCollectiveWin(players, 1, 5)).toBeNull();
  });

  it("retorna null quando empate na votação (sem expulsão) — pendingNightStart deve ser setado", () => {
    // Empate: ninguém expulso; criaturas(1) < moradores(2) → jogo continua
    // O finalizeDay agora SEMPRE seta pendingNightStart:true após votar, incluindo este caso
    const players = {
      w: snap("w", "lobisomem"),
      a: snap("a", "aldeao"),
      d: snap("d", "doutor"),
    };
    expect(checkCollectiveWin(players, 2, 5)).toBeNull();
  });

  it("retorna 'moradores' quando todas as criaturas são eliminadas", () => {
    const players = {
      w: snap("w", "lobisomem", { alive: false, eliminated: true }),
      a: snap("a", "aldeao"),
    };
    expect(checkCollectiveWin(players, 1, 5)).toBe("moradores");
  });

  it("retorna 'criaturas' quando criaturas >= moradores", () => {
    const players = {
      w: snap("w", "lobisomem"),
      s: snap("s", "saci"),
      a: snap("a", "aldeao"),
    };
    expect(checkCollectiveWin(players, 1, 5)).toBe("criaturas");
  });

  it("Curupira alinhada com moradores conta no mesmo lado que moradores no limiar", () => {
    const players = {
      w: snap("w", "lobisomem"),
      c: snap("c", "curupira", { alignment: "moradores" }),
    };
    expect(checkCollectiveWin(players, 1, 5)).toBe("criaturas");
  });

  it("Brás Cubas não infla o contador de moradores no limiar", () => {
    const players = {
      w: snap("w", "lobisomem"),
      b: snap("b", "bras_cubas", { alignment: "moradores" }),
    };
    expect(checkCollectiveWin(players, 1, 5)).toBe("criaturas");
  });

  it("retorna 'criaturas' quando rodada excede maxRounds", () => {
    const players = {
      w: snap("w", "lobisomem"),
      a: snap("a", "aldeao"),
      d: snap("d", "doutor"),
    };
    expect(checkCollectiveWin(players, 6, 5)).toBe("criaturas");
  });
});
