import type { RoleId } from "folclore-game-engine";
import { ROLE_SIDE } from "folclore-game-engine";

import type { BotContext, ChatMessageLite, LivingPlayerRef } from "./types.js";
import type { BotKnowledgeSnapshot } from "../botKnowledge/types.js";

import { getCharacterConfig } from "./characterConfigs.js";

const DAILY_EVENTS = [
  "no armazém",
  "na roça",
  "cuidando do terreiro",
  "na feira",
  "consertando cerca",
  "na casa da vizinha",
  "no bar",
  "na igreja",
  "no poço",
  "na estrada de terra",
];

function parseVictimFromLog(entries: Array<{ type?: string; message?: string }>): string | null {
  for (const e of entries) {
    if (e.type !== "death" || !e.message) continue;
    const m = /ausência\.\s*(.+?)\s+foi encontrado/i.exec(e.message);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function livingIdSet(ls: LivingPlayerRef[]): Set<string> {
  return new Set(ls.map((p) => p.id));
}

export type BuildBotContextArgs = {
  selfPlayerId: string;
  role: RoleId;
  roundNumber: number;
  messageIndex: number;
  votesRoundDay: number;
  livingPlayers: LivingPlayerRef[];
  chatHistory: ChatMessageLite[];
  publicLogThisDawn: Array<{ type?: string; message?: string }>;
  botoPlayerId: string | null;
  iaraPlayerId: string | null;
  padrePlayerId: string | null;
  rng: () => number;
  /** Alinhamento de neutros (Curup/Boit/B…). */
  neutralAlignment?: "moradores" | "criaturas" | null;
  botKnowledge?: BotKnowledgeSnapshot | null;
};

export function buildBotContext(args: BuildBotContextArgs): BotContext {
  const side = ROLE_SIDE[args.role];
  const cfg = getCharacterConfig(args.role);
  const victim = parseVictimFromLog(args.publicLogThisDawn);
  const dailyEvent = DAILY_EVENTS[args.roundNumber % DAILY_EVENTS.length] ?? DAILY_EVENTS[0]!;
  const liv = livingIdSet(args.livingPlayers);
  const kb = args.botKnowledge;

  let alignmentChosen: "moradores" | "criaturas" | null = null;
  if (side === "neutro") {
    const a = args.neutralAlignment;
    alignmentChosen = a === "moradores" || a === "criaturas" ? a : null;
  }

  const suspectedPlayers: string[] = [];
  const confirmedEnemiesAlive: string[] = [];
  if (kb) {
    for (const id of kb.confirmedEnemies) {
      if (liv.has(id) && id !== args.selfPlayerId) confirmedEnemiesAlive.push(id);
    }
    suspectedPlayers.push(...confirmedEnemiesAlive);
    const w = [...kb.suspectedEnemiesWeighted].filter((x) => liv.has(x.playerId) && x.playerId !== args.selfPlayerId);
    w.sort((a, b) => b.weight - a.weight || args.rng() - 0.5);
    for (const row of w.slice(0, 4)) {
      if (!suspectedPlayers.includes(row.playerId)) suspectedPlayers.push(row.playerId);
    }
    if (!suspectedPlayers.length) {
      const others = args.livingPlayers.filter((p) => p.id !== args.selfPlayerId);
      const shuffled = [...others].sort(() => args.rng() - 0.5);
      for (const p of shuffled.slice(0, 2)) suspectedPlayers.push(p.id);
    }
  } else {
    const others = args.livingPlayers.filter((p) => p.id !== args.selfPlayerId);
    const shuffled = [...others].sort(() => args.rng() - 0.5);
    for (const p of shuffled.slice(0, 3)) suspectedPlayers.push(p.id);
  }

  const pri = args.roundNumber > 1 ? args.roundNumber - 1 : null;
  let wasAccusedBy: string | null = null;
  let semanticAccusesConfirmedEnemy = false;
  if (pri != null) {
    for (const m of args.chatHistory) {
      const vr = typeof m.votesRound === "number" ? m.votesRound : Number(m.votesRound);
      if (!Number.isFinite(vr) || vr !== pri) continue;
      if (
        m.semanticKind === "accuse" &&
        m.semanticTargetId === args.selfPlayerId &&
        m.playerId &&
        m.playerId !== args.selfPlayerId &&
        !wasAccusedBy
      ) {
        wasAccusedBy = m.playerId;
      }
      if (
        kb &&
        confirmedEnemiesAlive.length &&
        m.semanticKind === "accuse" &&
        m.semanticTargetId &&
        confirmedEnemiesAlive.includes(m.semanticTargetId)
      ) {
        semanticAccusesConfirmedEnemy = true;
        break;
      }
    }
  }

  const hasConfirmedEnemyAlive = confirmedEnemiesAlive.length > 0;

  return {
    selfPlayerId: args.selfPlayerId,
    role: args.role,
    side,
    alignmentChosen,
    dailyEvent,
    suspectedPlayers,
    livingPlayers: args.livingPlayers,
    wasAccusedBy,
    semanticAccusesConfirmedEnemy,
    hasConfirmedEnemyAlive,
    confirmedEnemiesAlive,
    didAccuseThisRound: false,
    victim,
    roundNumber: args.roundNumber,
    messageIndex: args.messageIndex,
    chatHistory: args.chatHistory,
    silentRate: cfg.silentRate,
    maxMessages: cfg.maxMessages,
    accuseTargetName: null,
    accuseTargetId: null,
    botoId: args.botoPlayerId,
    iaraId: args.iaraPlayerId,
    padreId: args.padrePlayerId,
    votesRoundDay: args.votesRoundDay,
    botKnowledge: kb ?? null,
  };
}
