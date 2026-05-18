import type { RoleId } from "folclore-game-engine";

/** Reason token stored on bot player + optional debug blob on votes doc. */
export type BotVoteReasonToken =
  | "confirmed"
  | "suspected"
  | "traitor"
  | "random"
  | "self_defense"
  | "chaos"
  | "bras_troll";

export type WeightedSuspect = { playerId: string; weight: number };

/** Persisted under `players/{id}.botKnowledge` for `isBot: true`. */
export type BotKnowledgeSnapshot = {
  confirmedEnemies: string[];
  confirmedAllies: string[];
  suspectedEnemiesWeighted: WeightedSuspect[];
  suspectedAlliesWeighted: WeightedSuspect[];
  votedAgainstMe: string[];
  defendedBy: string[];
  accusedBy: string[];
  /** Only roles this bot inferred from own investigate/converse/cang Romance path. */
  enemyRoleKnown: Partial<Record<string, RoleId>>;
  voteReasonByRound: Array<{
    round: number;
    votedFor: string | null;
    reason: BotVoteReasonToken;
  }>;
  mistakeSignalCount: number;
  mistakeLastRound: number | null;
  /** Seen private protection-style messages — an ally exists somewhere. */
  phantomProtectorSuspected: boolean;
};

export const PROMOTE_WEIGHT = 2;

export const VOTE_REASON_HISTORY_CAP = 24;

/** Semantic tags written by server on bot-authored chat. */
export type ChatSemanticKind = "accuse" | "defend" | "agree";

export type ChatSemanticLite = {
  playerId?: string;
  semanticKind?: ChatSemanticKind;
  semanticTargetId?: string | null;
  votesRound?: number;
};

export function emptyBotKnowledge(): BotKnowledgeSnapshot {
  return {
    confirmedEnemies: [],
    confirmedAllies: [],
    suspectedEnemiesWeighted: [],
    suspectedAlliesWeighted: [],
    votedAgainstMe: [],
    defendedBy: [],
    accusedBy: [],
    enemyRoleKnown: {},
    voteReasonByRound: [],
    mistakeSignalCount: 0,
    mistakeLastRound: null,
    phantomProtectorSuspected: false,
  };
}
