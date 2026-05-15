import type { DebugSetupPersisted } from "./types.js";

const KEY = "folhetim_debug_setup_v1";

const defaultBots = (total: number): DebugSetupPersisted["bots"] => {
  const n = Math.max(0, Math.min(total - 1, 11));
  return Array.from({ length: n }, () => ({
    role: "random" as const,
    name: "",
    alwaysVote: null,
  }));
};

export function defaultDebugSetup(): DebugSetupPersisted {
  return {
    playerName: "Debug Player",
    playerRole: "aldeao",
    totalPlayers: 5,
    bots: defaultBots(5),
    startRound: 1,
    skipNight: false,
    forceMoonPhase: null,
    showAllRoles: false,
    slowMode: false,
  };
}

export function loadDebugSetup(): DebugSetupPersisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultDebugSetup();
    const parsed = JSON.parse(raw) as Partial<DebugSetupPersisted>;
    const base = defaultDebugSetup();
    const totalPlayers = Math.min(
      12,
      Math.max(4, Number(parsed.totalPlayers ?? base.totalPlayers)),
    );
    let bots =
      Array.isArray(parsed.bots) && parsed.bots.length === totalPlayers - 1
        ? parsed.bots
        : defaultBots(totalPlayers);
    bots = bots.map((b) => ({
      name: typeof b?.name === "string" ? b.name : "",
      role: typeof b?.role === "string" ? (b.role as DebugSetupPersisted["bots"][0]["role"]) : "random",
      alwaysVote: b?.alwaysVote === "__HOST__" || b?.alwaysVote === null || b?.alwaysVote === ""
        ? b?.alwaysVote ?? null
        : typeof b?.alwaysVote === "string"
          ? b.alwaysVote
          : null,
    }));
    return {
      ...base,
      ...parsed,
      totalPlayers,
      bots,
      startRound: Math.min(7, Math.max(1, Number(parsed.startRound ?? 1))),
      skipNight: Boolean(parsed.skipNight),
      showAllRoles: Boolean(parsed.showAllRoles),
      slowMode: Boolean(parsed.slowMode),
      forceMoonPhase:
        parsed.forceMoonPhase === "crescent" || parsed.forceMoonPhase === "full"
          ? parsed.forceMoonPhase
          : null,
    };
  } catch {
    return defaultDebugSetup();
  }
}

export function saveDebugSetup(s: DebugSetupPersisted): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clampBots(totalPlayers: number, bots: DebugSetupPersisted["bots"]): DebugSetupPersisted["bots"] {
  const need = totalPlayers - 1;
  if (bots.length === need) return bots;
  if (bots.length < need) {
    return [
      ...bots,
      ...Array.from({ length: need - bots.length }, () => ({
        role: "random" as const,
        name: "",
        alwaysVote: null as string | null,
      })),
    ];
  }
  return bots.slice(0, need);
}
