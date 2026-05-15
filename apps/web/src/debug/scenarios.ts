import type { RoleId } from "folclore-game-engine";
import type { DebugScenarioId, DebugSetupConfig } from "./types.js";

const HOST = "__HOST__";

/** Bot rows: role + vote target placeholder for Gorro scenarios */
function botsPreset(
  rows: Array<{ role: RoleId | "random"; alwaysVote?: string | null }>,
): DebugSetupConfig["bots"] {
  return rows.map((r) => ({
    name: "",
    role: r.role,
    alwaysVote: r.alwaysVote ?? null,
  }));
}

export const SCENARIO_DEFS: Record<
  DebugScenarioId,
  { label: string; build: () => DebugSetupConfig }
> = {
  saci_gorro: {
    label: "Testar Saci Gorro",
    build: () => ({
      playerName: "Debug Player",
      playerRole: "saci",
      totalPlayers: 5,
      bots: botsPreset([
        { role: "aldeao", alwaysVote: HOST },
        { role: "doutor", alwaysVote: HOST },
        { role: "delegado", alwaysVote: HOST },
        { role: "lobisomem", alwaysVote: HOST },
      ]),
      startRound: 1,
      skipNight: false,
      forceMoonPhase: null,
      showAllRoles: true,
      slowMode: false,
      scenarioLabel: "saci_gorro",
    }),
  },
  bras: {
    label: "Testar Brás Cubas",
    build: () => ({
      playerName: "Debug Player",
      playerRole: "bras_cubas",
      totalPlayers: 5,
      bots: botsPreset([
        { role: "delegado" },
        { role: "doutor" },
        { role: "padre" },
        { role: "aldeao" },
      ]),
      startRound: 1,
      skipNight: false,
      forceMoonPhase: null,
      showAllRoles: true,
      slowMode: false,
      scenarioLabel: "bras",
    }),
  },
  mula_padre: {
    label: "Testar Mula vs Padre",
    build: () => ({
      playerName: "Debug Player",
      playerRole: "mula",
      totalPlayers: 5,
      bots: botsPreset([
        { role: "padre" },
        { role: "aldeao" },
        { role: "delegado" },
        { role: "doutor" },
      ]),
      startRound: 1,
      skipNight: false,
      forceMoonPhase: null,
      showAllRoles: true,
      slowMode: false,
      scenarioLabel: "mula_padre",
    }),
  },
  cangaceiro_geni: {
    label: "Testar Cangaceiro + Geni",
    build: () => ({
      playerName: "Debug Player",
      playerRole: "cangaceiro",
      totalPlayers: 5,
      bots: botsPreset([
        { role: "iara" },
        { role: "geni" },
        { role: "aldeao" },
        { role: "delegado" },
      ]),
      startRound: 1,
      skipNight: false,
      forceMoonPhase: null,
      showAllRoles: true,
      slowMode: false,
      scenarioLabel: "cangaceiro_geni",
    }),
  },
  bots_apocalypse: {
    label: "Testar Apocalipse Robô",
    build: () => ({
      playerName: "Debug Player",
      playerRole: "aldeao",
      totalPlayers: 6,
      bots: botsPreset([
        { role: "random" },
        { role: "random" },
        { role: "random" },
        { role: "random" },
        { role: "random" },
      ]),
      startRound: 1,
      skipNight: true,
      forceMoonPhase: null,
      showAllRoles: true,
      slowMode: true,
      scenarioLabel: "bots_apocalypse",
    }),
  },
  moon_full: {
    label: "Testar Lua Cheia",
    build: () => ({
      playerName: "Debug Player",
      playerRole: "aldeao",
      totalPlayers: 7,
      bots: botsPreset([
        { role: "lobisomem" },
        { role: "saci" },
        { role: "mula" },
        { role: "aldeao" },
        { role: "delegado" },
        { role: "doutor" },
      ]),
      startRound: 6,
      skipNight: true,
      forceMoonPhase: "full",
      showAllRoles: true,
      slowMode: false,
      scenarioLabel: "moon_full",
    }),
  },
  five_table: {
    label: "Testar 5 jogadores",
    build: () => ({
      playerName: "Debug Player",
      playerRole: "aldeao",
      totalPlayers: 5,
      bots: botsPreset([{ role: "random" }, { role: "random" }, { role: "random" }, { role: "random" }]),
      startRound: 1,
      skipNight: false,
      forceMoonPhase: null,
      showAllRoles: true,
      slowMode: false,
      scenarioLabel: "five_table",
    }),
  },
};
