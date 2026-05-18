import type { BotKnowledgeSnapshot } from "./types.js";
import type { ChatSemanticKind } from "./types.js";
import { bumpAllySuspect, bumpEnemySuspect, promoteSuspects } from "./merge.js";

export type ChatSemanticIngestRow = {
  votesRound?: number;
  semanticKind?: ChatSemanticKind;
  semanticTargetId?: string | null;
};

/** Aplica atualizações de peso vindas apenas de mensagens com semântica (bots), dia anterior. */
export function analyzePriorRoundSemanticChat(
  priorVotesRound: number,
  rows: ChatSemanticIngestRow[],
  kbByBotId: Map<string, BotKnowledgeSnapshot>,
  survivingBotIds: Set<string>,
): void {
  const filtered = rows.filter((r) => Number(r.votesRound) === priorVotesRound);
  for (const m of filtered) {
    const kind = m.semanticKind;
    const tgt = typeof m.semanticTargetId === "string" ? m.semanticTargetId : null;
    if (!tgt || !kind) continue;

    for (const bid of survivingBotIds) {
      const kb = kbByBotId.get(bid);
      if (!kb) continue;

      if (kind === "accuse") {
        if (!kb.confirmedAllies.includes(tgt)) bumpEnemySuspect(kb, tgt, 1);
      } else if (kind === "defend") {
        if (!kb.confirmedEnemies.includes(tgt)) bumpAllySuspect(kb, tgt, 1);
      } else if (kind === "agree") {
        if (!kb.confirmedAllies.includes(tgt)) bumpEnemySuspect(kb, tgt, 1);
      }
    }
  }

  for (const botId of kbByBotId.keys()) {
    if (!survivingBotIds.has(botId)) continue;
    const kb = kbByBotId.get(botId);
    if (kb) promoteSuspects(kb);
  }
}
