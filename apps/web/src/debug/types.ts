import type { RoleId } from "folclore-game-engine";

export type DebugBotRolePick = RoleId | "random";

export type DebugBotSlot = {
  /** Display name override; empty lets server assign from BOT_NAMES pool */
  name?: string;
  role: DebugBotRolePick;
  /** When set, bots always vote this player id (use "__HOST__" for human, resolved server-side). */
  alwaysVote?: string | null;
};

export type DebugForceMoonPhase = null | "crescent" | "full";

export type DebugScenarioId =
  | "saci_gorro"
  | "bras"
  | "mula_padre"
  | "cangaceiro_geni"
  | "bots_apocalypse"
  | "moon_full"
  | "five_table";

/** Persisted debug setup (panel state). Mirrors payload sent to `startDebugGame`. */
export type DebugSetupPersisted = {
  playerName: string;
  playerRole: RoleId;
  totalPlayers: number;
  bots: DebugBotSlot[];
  startRound: number;
  skipNight: boolean;
  forceMoonPhase: DebugForceMoonPhase;
  showAllRoles: boolean;
  slowMode: boolean;
};

export type DebugSetupConfig = DebugSetupPersisted & {
  /** Optional scenario label for UX only */
  scenarioLabel?: DebugScenarioId;
};
