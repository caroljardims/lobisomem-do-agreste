import type { GeniInvestigationRecord, NightActionInput, PrivateLogEntry, PlayerDawnState } from "folclore-game-engine";
import {
  ROLE_SIDE,
  geniInvestigationsPriorToRound,
  isCreatureRole,
} from "folclore-game-engine";
import type { RoleId } from "folclore-game-engine";
import {
  TARGET_CURUPIRA_PROTECTED,
  TARGET_DOUTOR_SAVED,
  TARGET_GENI_CHARME,
  TARGET_WOLF_PROTECTED,
} from "folclore-game-engine";

import type { BotKnowledgeSnapshot } from "./types.js";
import {
  addConfirmedAlly,
  addConfirmedEnemy,
  bumpEnemySuspect,
  classifyInsight,
  promoteSuspects,
  recordEnemyRole,
} from "./merge.js";

type SecretsMap = Record<string, { role: RoleId; side: import("folclore-game-engine").Side } | undefined>;

type LoadedPlayerLite = Record<string, unknown> & {
  id: string;
  isBot?: boolean;
  alignment?: string;
};

/** Saci robbed this night's action (start-of-night markers on actor). */
function wasNightActionStolen(dawnPlayers: Record<string, PlayerDawnState>, actorId: string): boolean {
  const p = dawnPlayers[actorId];
  return Boolean(p?.blockedNextNight && p.nightAbilityBlockSource === "saci");
}

function findPidByRole(players: Record<string, PlayerDawnState>, role: RoleId): string | undefined {
  for (const [id, p] of Object.entries(players)) {
    if (p.role === role && p.alive && !p.eliminated && !p.expelled) return id;
  }
  return undefined;
}

function getNightActionForRole(
  nightActions: Record<string, NightActionInput | undefined>,
  dawnPlayers: Record<string, PlayerDawnState>,
  role: RoleId,
): { playerId: string; action: NightActionInput } | undefined {
  const pid = findPidByRole(dawnPlayers, role);
  if (!pid) return undefined;
  const a = nightActions[pid];
  if (!a) return undefined;
  return { playerId: pid, action: a };
}

function alignmentMoradorCriaturaForInvestigate(side: string): "criatura" | "morador" {
  return side === "criatura" ? "criatura" : "morador";
}

function invertedCartomante(label: "criatura" | "morador", targetRole: RoleId): "criatura" | "morador" {
  if (targetRole !== "curupira") return label;
  return label === "criatura" ? "morador" : "criatura";
}

function botAlign(
  role: RoleId,
  rowAlign: LoadedPlayerLite | undefined,
): "moradores" | "criaturas" | null {
  const a = rowAlign?.alignment;
  if (a === "moradores" || a === "criaturas") return a;
  if (ROLE_SIDE[role] === "neutro") return null;
  return ROLE_SIDE[role] === "criatura" ? "criaturas" : "moradores";
}

function consultTriLabelResolved(role: RoleId): "criatura" | "morador" | "neutro" {
  const side = ROLE_SIDE[role];
  if (side === "neutro") return "neutro";
  return side === "criatura" ? "criatura" : "morador";
}

/** Apply investigative + Romance + Cang query + shield lines for all live bots after resolveDawn. */
export function mergeBotKnowledgeFromNightResolve(args: {
  round: number;
  dawnPlayersBefore: Record<string, PlayerDawnState>;
  resPlayersAfter: Record<string, PlayerDawnState>;
  nightActions: Record<string, NightActionInput | undefined>;
  secrets: SecretsMap;
  playerRowsById: Map<string, LoadedPlayerLite>;
  botIds: Set<string>;
  geniPid: string | undefined;
  geniInvestigatedIds: Record<string, GeniInvestigationRecord[]>;
  privateLogNew: Record<string, PrivateLogEntry[]>;
  kbByBotId: Map<string, BotKnowledgeSnapshot>;
}): void {
  const {
    round,
    dawnPlayersBefore,
    nightActions,
    secrets,
    playerRowsById,
    botIds,
    geniPid,
    geniInvestigatedIds,
    privateLogNew,
    kbByBotId,
    resPlayersAfter,
  } = args;

  const livingIdsAfter = new Set(
    Object.entries(resPlayersAfter)
      .filter(([, pl]) => pl.alive && !pl.eliminated && !pl.expelled)
      .map(([id]) => id),
  );

  function kbFor(pid: string): BotKnowledgeSnapshot | null {
    if (!botIds.has(pid)) return null;
    const kb = kbByBotId.get(pid);
    if (!kb) return null;
    return kb;
  }

  /** Cartomante / Boitatá investigations */
  for (const role of ["cartomante", "boitata"] as const) {
    const got = getNightActionForRole(nightActions, dawnPlayersBefore, role);
    if (!got?.action.targetId || got.action.action !== "investigate") continue;
    if (wasNightActionStolen(dawnPlayersBefore, got.playerId)) continue;
    const kb = kbFor(got.playerId);
    if (!kb) continue;
    const tid = got.action.targetId;
    const tRole = secrets[tid]?.role;
    if (!tRole || !livingIdsAfter.has(tid)) continue;
    let label = alignmentMoradorCriaturaForInvestigate(ROLE_SIDE[tRole]);
    if (role === "cartomante") label = invertedCartomante(label, tRole);
    const row = playerRowsById.get(got.playerId);
    const cls = classifyInsight(secrets[got.playerId]!.role, botAlign(secrets[got.playerId]!.role, row), label);
    if (cls === "enemy") addConfirmedEnemy(kb, tid);
    else if (cls === "ally") addConfirmedAlly(kb, tid);
    recordEnemyRole(kb, tid, tRole);
  }

  /** Geni converse + Romance da Caatinga (Geni+Cang) via prior investigative list */
  const geniGa = getNightActionForRole(nightActions, dawnPlayersBefore, "geni");
  if (
    geniGa &&
    geniGa.action.action === "converse" &&
    geniGa.action.targetId &&
    !wasNightActionStolen(dawnPlayersBefore, geniGa.playerId)
  ) {
    const targetId = geniGa.action.targetId;
    const tRole = secrets[targetId]?.role;
    const genKb = kbFor(geniGa.playerId);
    if (genKb && tRole && livingIdsAfter.has(targetId)) {
      const lab = isCreatureRole(tRole) ? "criatura" : "morador";
      const row = playerRowsById.get(geniGa.playerId);
      const cls = classifyInsight(secrets[geniGa.playerId]!.role, botAlign(secrets[geniGa.playerId]!.role, row), lab);
      if (cls === "enemy") addConfirmedEnemy(genKb, targetId);
      else if (cls === "ally") addConfirmedAlly(genKb, targetId);
      recordEnemyRole(genKb, targetId, tRole);
    }

    if (tRole === "cangaceiro" && geniPid && livingIdsAfter.has(targetId)) {
      const hist = geniInvestigatedIds[geniPid] ?? [];
      const prior = geniInvestigationsPriorToRound(hist, round);
      const cKb = kbFor(targetId);
      const cRow = playerRowsById.get(targetId);
      if (cKb && prior.length) {
        for (const e of prior) {
          const investigatedId = e.playerId;
          if (!livingIdsAfter.has(investigatedId)) continue;
          const invRole = secrets[investigatedId]?.role;
          if (!invRole) continue;
          const cls = classifyInsight(
            secrets[targetId]!.role,
            botAlign(secrets[targetId]!.role, cRow),
            e.result === "criatura" ? "criatura" : "morador",
          );
          if (cls === "enemy") addConfirmedEnemy(cKb, investigatedId);
          else if (cls === "ally") addConfirmedAlly(cKb, investigatedId);
          recordEnemyRole(cKb, investigatedId, invRole);
        }
      }
    }
  }

  /** Cangaceiro optional consult — requires Geni to have chatted with query target before this dawn */
  const cangNight = getNightActionForRole(nightActions, dawnPlayersBefore, "cangaceiro");
  if (
    cangNight &&
    cangNight.action.action === "query" &&
    cangNight.action.targetId &&
    !wasNightActionStolen(dawnPlayersBefore, cangNight.playerId) &&
    geniPid
  ) {
    const cKb = kbFor(cangNight.playerId);
    const tid = cangNight.action.targetId!;
    const tRole = secrets[tid]?.role;
    if (cKb && tRole) {
      const geniHist = geniInvestigatedIds[geniPid] ?? [];
      const prior = geniInvestigationsPriorToRound(geniHist, round);
      const investigated = prior.some((e) => e.playerId === tid);
      const cRow = playerRowsById.get(cangNight.playerId);
      if (investigated && livingIdsAfter.has(tid)) {
        const tri = consultTriLabelResolved(tRole);
        if (tri !== "neutro") {
          const cls = classifyInsight(
            secrets[cangNight.playerId]!.role,
            botAlign(secrets[cangNight.playerId]!.role, cRow),
            tri,
          );
          if (cls === "enemy") addConfirmedEnemy(cKb, tid);
          else if (cls === "ally") addConfirmedAlly(cKb, tid);
        }
        recordEnemyRole(cKb, tid, tRole);
      }
    }
  }

  const firstLine = (m: string) => m.trim().split("\n")[0] ?? "";
  const shieldPrefixes = [
    firstLine(TARGET_CURUPIRA_PROTECTED).slice(0, 24),
    firstLine(TARGET_DOUTOR_SAVED).slice(0, 24),
    firstLine(TARGET_GENI_CHARME).slice(0, 24),
  ].filter(Boolean);
  const wolfProtPrefix = firstLine(TARGET_WOLF_PROTECTED).slice(0, 28);

  for (const botId of botIds) {
    const kb = kbByBotId.get(botId);
    if (!kb || !livingIdsAfter.has(botId)) continue;
    const newEntries = privateLogNew[botId] ?? [];

    for (const e of newEntries) {
      const msg = typeof e.message === "string" ? e.message : "";
      for (const p of shieldPrefixes) {
        if (p.length > 6 && msg.startsWith(p)) kb.phantomProtectorSuspected = true;
      }
      if (wolfProtPrefix.length > 8 && msg.startsWith(wolfProtPrefix)) {
        splashSuspectedOpposite(kb, botId, secrets, playerRowsById, livingIdsAfter);
      }
    }
    promoteSuspects(kb);
  }
}

function splashSuspectedOpposite(
  kb: BotKnowledgeSnapshot,
  botId: string,
  secrets: SecretsMap,
  rows: Map<string, LoadedPlayerLite>,
  livingsAfter: Set<string>,
): void {
  const mr = secrets[botId]?.role;
  if (!mr) return;
  const row = rows.get(botId);

  /** Town fights folklore */
  function townSplash() {
    for (const pid of livingsAfter) {
      if (pid === botId) continue;
      const r = secrets[pid]?.role;
      if (r && ROLE_SIDE[r] === "criatura") bumpEnemySuspect(kb, pid, 2);
    }
  }
  /** Folklore fights town */
  function creatureSplash() {
    for (const pid of livingsAfter) {
      if (pid === botId) continue;
      const r = secrets[pid]?.role;
      if (!r) continue;
      if (ROLE_SIDE[r] !== "criatura") bumpEnemySuspect(kb, pid, 2);
    }
  }

  if (ROLE_SIDE[mr] === "criatura") creatureSplash();
  else if (ROLE_SIDE[mr] === "morador") townSplash();
  else if (row?.alignment === "moradores") townSplash();
  else if (row?.alignment === "criaturas") creatureSplash();
}
