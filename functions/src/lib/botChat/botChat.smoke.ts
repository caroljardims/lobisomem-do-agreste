import assert from "node:assert/strict";
import { moradorTree, evaluateTree } from "./behaviorTree.js";
import { buildBotContext } from "./context.js";
import { getBotMessage, runBotBehavior } from "./orchestrator.js";
import type { LivingPlayerRef } from "./types.js";

function rng(seed = 0.42): () => number {
  let x = seed * 1e9;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return (x & 0x7fffffff) / 0x7fffffff;
  };
}

const living: LivingPlayerRef[] = [
  { id: "b1", name: "Bot Um", side: "morador", isBot: true },
  { id: "p2", name: "Fulano", side: "morador", isBot: false },
  { id: "p3", name: "Ciclano", side: "criatura", isBot: false },
];

const baseArgs = {
  selfPlayerId: "b1",
  role: "aldeao" as const,
  roundNumber: 2,
  messageIndex: 0,
  votesRoundDay: 2,
  neutralAlignment: null as null,
  livingPlayers: living,
  chatHistory: [] as { playerId: string; name: string; text: string; type?: string }[],
  publicLogThisDawn: [{ type: "death", message: "A cidade acorda com uma ausência. Fulano foi encontrado(a) sem vida. Era Aldeão." }],
  botoPlayerId: null,
  iaraPlayerId: null,
  padrePlayerId: null,
  rng: rng(0.1),
};

(() => {
  const ctx = buildBotContext(baseArgs);
  const t = evaluateTree(moradorTree(), ctx, rng(0.99));
  assert.equal(t, "REACT", "morador tree should react when victim present");
})();

(() => {
  const ctx = buildBotContext({
    ...baseArgs,
    role: "boto",
    publicLogThisDawn: [],
    rng: rng(0.5),
  });
  const t = runBotBehavior(ctx, rng(0.2));
  assert.notEqual(t, "ACCUSE", "boto should not end on ACCUSE after remap path");
})();

(() => {
  const ctx = buildBotContext({ ...baseArgs, rng: rng(0.33) });
  const msg = getBotMessage(ctx, rng(0.33));
  assert.ok(msg.length > 5, "getBotMessage should return a phrase");
})();

console.log("botChat smoke tests ok");
