import { ROLE_SIDE } from "folclore-game-engine";
import type { RoleId } from "folclore-game-engine";
import type { BotKnowledgeSnapshot } from "./types.js";
import { parseBotKnowledge, pruneKnowledgeToLiving } from "./merge.js";

const META_VOTE_KEYS = new Set(["updatedAt", "botVoteReasons"]);

function socioBucket(
  role: RoleId,
  alignment: "moradores" | "criaturas" | null | undefined,
): "town" | "folk" | "other" | null {
  if (role === "bras_cubas") return "other";
  const s = ROLE_SIDE[role];
  if (s === "morador") return "town";
  if (s === "criatura") return "folk";
  if (s === "neutro") {
    if (alignment === "moradores") return "town";
    if (alignment === "criaturas") return "folk";
    return null;
  }
  return null;
}

function appendUnique(arr: string[], id: string): void {
  if (!arr.includes(id)) arr.push(id);
}

/** Atualiza `votedAgainstMe` quando alguém vota diretamente em um bot vivo. */
export function mergeBotsVotedAgainstMeFromVoteDoc(
  voteRows: Record<string, string | null | undefined>,
  kbByBotId: Map<string, BotKnowledgeSnapshot>,
  botIds: Set<string>,
): void {
  for (const [voterId, raw] of Object.entries(voteRows)) {
    if (META_VOTE_KEYS.has(voterId)) continue;
    const targetId =
      raw == null || raw === ""
        ? null
        : String(raw);
    if (!targetId || !botIds.has(targetId)) continue;
    const kb = kbByBotId.get(targetId);
    if (!kb || voterId === targetId) continue;
    appendUnique(kb.votedAgainstMe, voterId);
  }
}

/** Corta jogadores eliminados/expulsos das listas persistidas nos bots sobreviventes. */
export function pruneAllBotsKnowledge(
  livingWithoutExpelled: Set<string>,
  kbByBotId: Map<string, BotKnowledgeSnapshot>,
  survivingBotIds: Set<string>,
): void {
  for (const botId of survivingBotIds) {
    const kb = kbByBotId.get(botId);
    if (!kb) continue;
    kbByBotId.set(botId, pruneKnowledgeToLiving(livingWithoutExpelled, kb));
  }
}

/** Após uma expulsão, incrementa erro de grupo quando o bot “erra o lado”. */
export function bumpMistakeIfExpelledAllyBotPerspective(args: {
  expelledId: string;
  expelledRole: RoleId;
  expelledAlign: "moradores" | "criaturas" | null | undefined;
  kbByBotId: Map<string, BotKnowledgeSnapshot>;
  survivingBotIds: Set<string>;
  botsMeta: Map<string, { role: RoleId; alignment?: "moradores" | "criaturas" | null }>;
  voteRound: number;
}): void {
  const { expelledId, expelledRole, expelledAlign, kbByBotId, survivingBotIds, botsMeta, voteRound } =
    args;
  const expB = socioBucket(expelledRole, expelledAlign);
  if (expB == null || expB === "other") return;

  for (const botId of survivingBotIds) {
    const kb = kbByBotId.get(botId);
    if (!kb || botId === expelledId) continue;
    const meta = botsMeta.get(botId);
    if (!meta) continue;
    const botB = socioBucket(meta.role, meta.alignment ?? null);
    if (botB == null || botB === "other") continue;
    if (botB === expB) {
      kb.mistakeSignalCount += 1;
      kb.mistakeLastRound = voteRound;
    }
  }
}

export function hydrateKnowledgeMapFromPlayerRows(args: {
  players: ReadonlyArray<Record<string, unknown> & { id: string }>;
  botIds: Set<string>;
}): Map<string, BotKnowledgeSnapshot> {
  const m = new Map<string, BotKnowledgeSnapshot>();
  for (const pl of args.players) {
    if (!args.botIds.has(pl.id)) continue;
    m.set(pl.id, parseBotKnowledge(pl.botKnowledge));
  }
  return m;
}

export function stringifyBotKnowledgeFirestore(kb: BotKnowledgeSnapshot): Record<string, unknown> {
  return JSON.parse(JSON.stringify(kb)) as Record<string, unknown>;
}
