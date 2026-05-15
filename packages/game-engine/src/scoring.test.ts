import { describe, expect, it } from "vitest";
import { effectiveScoringFaction, isEnemyForMvp } from "./scoring.js";

describe("scoring", () => {
  it("morador vs criatura = inimigo", () => {
    expect(isEnemyForMvp("aldeao", null, "lobisomem", null)).toBe(true);
    expect(isEnemyForMvp("lobisomem", null, "padre", null)).toBe(true);
  });

  it("mesmo lado = não inimigo", () => {
    expect(isEnemyForMvp("padre", null, "doutor", null)).toBe(false);
    expect(isEnemyForMvp("mula", null, "boto", null)).toBe(false);
  });

  it("neutro alinhado opõe ao outro alinhamento", () => {
    expect(isEnemyForMvp("curupira", "moradores", "boitata", "criaturas")).toBe(true);
    expect(isEnemyForMvp("curupira", "moradores", "padre", null)).toBe(false);
  });

  it("Brás não tem lado para MVP", () => {
    expect(effectiveScoringFaction("bras_cubas", null)).toBe(null);
    expect(isEnemyForMvp("bras_cubas", null, "lobisomem", null)).toBe(false);
  });
});
