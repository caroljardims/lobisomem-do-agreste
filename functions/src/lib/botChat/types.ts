import type { RoleId } from "folclore-game-engine";

import type { BotKnowledgeSnapshot } from "../botKnowledge/types.js";

export type ChatSemanticKindTagged = "accuse" | "defend" | "agree";

export type MessageType =
  | "ALIBI"
  | "ACCUSE"
  | "DEFEND"
  | "REACT"
  | "DEFLECT"
  | "AGREE"
  | "DOUBT";

export type MessageTypeWeights = Record<MessageType, number>;

export type LivingPlayerRef = {
  id: string;
  name: string;
  side: "criatura" | "morador" | "neutro";
  isBot: boolean;
};

export type ChatMessageLite = {
  playerId: string;
  name: string;
  text: string;
  type?: string;
  votesRound?: number;
  semanticKind?: ChatSemanticKindTagged;
  semanticTargetId?: string | null;
};

export type BotChatSegment = {
  text: string;
  semanticKind?: ChatSemanticKindTagged;
  semanticTargetId?: string | null;
};

export type BotContext = {
  selfPlayerId: string;
  role: RoleId;
  side: "criatura" | "morador" | "neutro";
  /** Neutros Curupira/Boitatá: lado escolhido na primeira noite. */
  alignmentChosen: "moradores" | "criaturas" | null;
  dailyEvent: string;
  suspectedPlayers: string[];
  livingPlayers: LivingPlayerRef[];
  wasAccusedBy: string | null;
  semanticAccusesConfirmedEnemy: boolean;
  hasConfirmedEnemyAlive: boolean;
  confirmedEnemiesAlive: string[];
  didAccuseThisRound: boolean;
  victim: string | null;
  roundNumber: number;
  messageIndex: number;
  chatHistory: ChatMessageLite[];
  silentRate: number;
  maxMessages: number;
  excludeTypes?: MessageType[];
  accuseTargetName: string | null;
  accuseTargetId: string | null;
  botoId: string | null;
  iaraId: string | null;
  padreId: string | null;
  votesRoundDay: number;
  botKnowledge?: BotKnowledgeSnapshot | null;
};

export type BehaviorNode =
  | { kind: "sequence"; children: BehaviorNode[] }
  | { kind: "selector"; children: BehaviorNode[] }
  | { kind: "condition"; test: (ctx: BotContext) => boolean }
  | { kind: "randomPass"; p: number }
  | { kind: "action"; messageType: MessageType };

export type CharacterConfig = {
  weights: MessageTypeWeights;
  silentRate: number;
  maxMessages: number;
  postProcess?: (phrase: string, ctx: BotContext, rng: () => number) => string;
};

export type Rng = () => number;
