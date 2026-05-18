import type { RoleId } from "folclore-game-engine";
import { ROLE_SIDE } from "folclore-game-engine";
import type { BotKnowledgeSnapshot, BotVoteReasonToken, WeightedSuspect } from "./types.js";
import {
  PROMOTE_WEIGHT,
  VOTE_REASON_HISTORY_CAP,
  emptyBotKnowledge,
} from "./types.js";

export function parseBotKnowledge(raw: unknown): BotKnowledgeSnapshot {
  if (!raw || typeof raw !== "object") return emptyBotKnowledge();
  const x = raw as Record<string, unknown>;
  const wIn = Array.isArray(x.suspectedEnemiesWeighted)
    ? (x.suspectedEnemiesWeighted as unknown[])
        .filter(
          (w): w is WeightedSuspect =>
            Boolean(w && typeof w === "object" && typeof (w as WeightedSuspect).playerId === "string"),
        )
        .map((w) => ({
          playerId: String((w as WeightedSuspect).playerId),
          weight: Math.max(0, Number((w as WeightedSuspect).weight ?? 0)),
        }))
    : [];
  const wAll = Array.isArray(x.suspectedAlliesWeighted)
    ? (x.suspectedAlliesWeighted as unknown[])
        .filter(
          (w): w is WeightedSuspect =>
            Boolean(w && typeof w === "object" && typeof (w as WeightedSuspect).playerId === "string"),
        )
        .map((w) => ({
          playerId: String((w as WeightedSuspect).playerId),
          weight: Math.max(0, Number((w as WeightedSuspect).weight ?? 0)),
        }))
    : [];
  const erh =
    typeof x.enemyRoleKnown === "object" && x.enemyRoleKnown
      ? ({ ...(x.enemyRoleKnown as Record<string, RoleId>) })
      : {};
  const vrr = Array.isArray(x.voteReasonByRound)
    ? [...(x.voteReasonByRound as BotKnowledgeSnapshot["voteReasonByRound"])]
    : [];
  const base = emptyBotKnowledge();
  return {
    ...base,
    confirmedEnemies: Array.isArray(x.confirmedEnemies) ? [...(x.confirmedEnemies as string[])] : [],
    confirmedAllies: Array.isArray(x.confirmedAllies) ? [...(x.confirmedAllies as string[])] : [],
    suspectedEnemiesWeighted: wIn,
    suspectedAlliesWeighted: wAll,
    votedAgainstMe: Array.isArray(x.votedAgainstMe) ? [...(x.votedAgainstMe as string[])] : [],
    defendedBy: Array.isArray(x.defendedBy) ? [...(x.defendedBy as string[])] : [],
    accusedBy: Array.isArray(x.accusedBy) ? [...(x.accusedBy as string[])] : [],
    enemyRoleKnown: erh,
    voteReasonByRound: vrr.slice(-VOTE_REASON_HISTORY_CAP),
    mistakeSignalCount: typeof x.mistakeSignalCount === "number" ? Number(x.mistakeSignalCount) : 0,
    mistakeLastRound:
      typeof x.mistakeLastRound === "number" || x.mistakeLastRound === null
        ? x.mistakeLastRound != null
          ? Number(x.mistakeLastRound)
          : null
        : null,
    phantomProtectorSuspected: Boolean(x.phantomProtectorSuspected),
  };
}

export function knowledgeFromPlayerRow(row: Record<string, unknown>): BotKnowledgeSnapshot {
  return parseBotKnowledge(row.botKnowledge);
}

function stripWeighted(w: WeightedSuspect[], forbidden: Set<string>): WeightedSuspect[] {
  return w.filter((e) => !forbidden.has(e.playerId)).map((e) => ({ ...e }));
}

export function pruneKnowledgeToLiving(livingIds: Set<string>, k: BotKnowledgeSnapshot): BotKnowledgeSnapshot {
  const deadOrGone = (id: string) => !livingIds.has(id);
  const forbid = new Set<string>();
  for (const id of [
    ...k.confirmedEnemies,
    ...k.confirmedAllies,
    ...k.votedAgainstMe,
    ...k.defendedBy,
    ...k.accusedBy,
  ]) {
    if (deadOrGone(id)) forbid.add(id);
  }
  for (const bucket of [k.suspectedEnemiesWeighted, k.suspectedAlliesWeighted]) {
    for (const e of bucket) {
      if (deadOrGone(e.playerId)) forbid.add(e.playerId);
    }
  }
  const nextEr: Partial<Record<string, RoleId>> = { ...k.enemyRoleKnown };
  for (const pid of Object.keys(nextEr)) {
    if (!livingIds.has(pid)) delete nextEr[pid];
  }
  return {
    ...k,
    confirmedEnemies: k.confirmedEnemies.filter((id) => livingIds.has(id)),
    confirmedAllies: k.confirmedAllies.filter((id) => livingIds.has(id)),
    suspectedEnemiesWeighted: stripWeighted(k.suspectedEnemiesWeighted, forbid),
    suspectedAlliesWeighted: stripWeighted(k.suspectedAlliesWeighted, forbid),
    votedAgainstMe: k.votedAgainstMe.filter((id) => livingIds.has(id)),
    defendedBy: k.defendedBy.filter((id) => livingIds.has(id)),
    accusedBy: k.accusedBy.filter((id) => livingIds.has(id)),
    enemyRoleKnown: nextEr,
    voteReasonByRound: [...k.voteReasonByRound],
  };
}

export function recordEnemyRole(
  k: BotKnowledgeSnapshot,
  targetId: string,
  role: RoleId | undefined | null,
): void {
  if (!role) return;
  k.enemyRoleKnown[targetId] = role;
}

export function bumpEnemySuspect(k: BotKnowledgeSnapshot, playerId: string, delta = 1): void {
  const cur = k.suspectedEnemiesWeighted.find((e) => e.playerId === playerId);
  if (cur) cur.weight += delta;
  else k.suspectedEnemiesWeighted.push({ playerId, weight: delta });
}

export function bumpAllySuspect(k: BotKnowledgeSnapshot, playerId: string, delta = 1): void {
  const cur = k.suspectedAlliesWeighted.find((e) => e.playerId === playerId);
  if (cur) cur.weight += delta;
  else k.suspectedAlliesWeighted.push({ playerId, weight: delta });
}

export function addConfirmedEnemy(k: BotKnowledgeSnapshot, pid: string): void {
  if (!k.confirmedEnemies.includes(pid)) k.confirmedEnemies.push(pid);
  k.confirmedAllies = k.confirmedAllies.filter((id) => id !== pid);
  k.suspectedEnemiesWeighted = k.suspectedEnemiesWeighted.filter((e) => e.playerId !== pid);
}

export function addConfirmedAlly(k: BotKnowledgeSnapshot, pid: string): void {
  if (!k.confirmedAllies.includes(pid)) k.confirmedAllies.push(pid);
  k.confirmedEnemies = k.confirmedEnemies.filter((id) => id !== pid);
  k.suspectedAlliesWeighted = k.suspectedAlliesWeighted.filter((e) => e.playerId !== pid);
}

export function promoteSuspects(k: BotKnowledgeSnapshot): void {
  const toEnemy: string[] = [];
  const remainE: WeightedSuspect[] = [];
  for (const e of k.suspectedEnemiesWeighted) {
    if (e.weight >= PROMOTE_WEIGHT) toEnemy.push(e.playerId);
    else remainE.push(e);
  }
  k.suspectedEnemiesWeighted = remainE;
  for (const pid of toEnemy) addConfirmedEnemy(k, pid);

  const toAlly: string[] = [];
  const remainA: WeightedSuspect[] = [];
  for (const e of k.suspectedAlliesWeighted) {
    if (e.weight >= PROMOTE_WEIGHT) toAlly.push(e.playerId);
    else remainA.push(e);
  }
  k.suspectedAlliesWeighted = remainA;
  for (const pid of toAlly) addConfirmedAlly(k, pid);
}

export function appendVoteRound(
  k: BotKnowledgeSnapshot,
  round: number,
  votedFor: string | null,
  reason: BotVoteReasonToken,
): void {
  k.voteReasonByRound.push({ round, votedFor, reason });
  k.voteReasonByRound = k.voteReasonByRound.slice(-VOTE_REASON_HISTORY_CAP);
}

/** Map investigation label to enemy/ally for this bot snapshot. Null if ambiguous / neutro observation. */
export function classifyInsight(
  botSecretRole: RoleId,
  botAlignmentMoradoresVsCriaturas: "moradores" | "criaturas" | null | undefined,
  observedLabel: "criatura" | "morador" | "neutro",
): "enemy" | "ally" | null {
  const side = ROLE_SIDE[botSecretRole];
  let fight: "criatura" | "morador";
  if (side === "neutro") {
    const a = botAlignmentMoradoresVsCriaturas;
    if (a === "moradores") fight = "morador";
    else if (a === "criaturas") fight = "criatura";
    else return null;
  } else fight = side;

  if (observedLabel === "neutro") return null;

  const targetIsCreatureLike = observedLabel === "criatura";

  const botIsTown = fight === "morador";

  if (botIsTown && targetIsCreatureLike) return "enemy";
  if (botIsTown && !targetIsCreatureLike) return "ally";
  if (!botIsTown && targetIsCreatureLike) return "ally";
  return "enemy";
}
