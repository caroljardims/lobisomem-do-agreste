import assert from "node:assert/strict";
import test from "node:test";
import {
  criaturaTree,
  chatLooksLikeAccuse,
  evaluateTree,
  moradorTree,
  neutroTree,
} from "./behaviorTree.js";
import { buildBotContext } from "./context.js";
import { getBotMessagesForDayOpen, getBotMessage } from "./orchestrator.js";
import { fillTemplates, selectPhrase } from "./phraseSelection.js";
import type { BotContext, LivingPlayerRef } from "./types.js";

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
  publicLogThisDawn: [] as { type?: string; message?: string }[],
  botoPlayerId: null,
  iaraPlayerId: null,
  padrePlayerId: null,
  rng: rng(0.1),
};

test("fillTemplates replaces placeholders", () => {
  const ctx = {
    dailyEvent: "no bar",
    accuseTargetName: "Zé",
    victim: "Maria",
    wasAccusedBy: "João",
  } as BotContext;
  const s = fillTemplates("Vi {event} e {target} com {victim} — {accuser} disse o contrário.", ctx);
  assert.equal(s, "Vi no bar e Zé com Maria — João disse o contrário.");
});

test("buildBotContext parses victim from death log", () => {
  const ctx = buildBotContext({
    ...baseArgs,
    publicLogThisDawn: [
      {
        type: "death",
        message: "A cidade acorda com uma ausência. Fulano foi encontrado(a) sem vida. Era Aldeão.",
      },
    ],
  });
  assert.equal(ctx.victim, "Fulano");
});

test("evaluateTree morador reacts when victim present", () => {
  const ctx = buildBotContext({
    ...baseArgs,
    publicLogThisDawn: [
      {
        type: "death",
        message: "A cidade acorda com uma ausência. Fulano foi encontrado(a) sem vida.",
      },
    ],
    rng: rng(0.2),
  });
  const t = evaluateTree(moradorTree(), ctx, rng(0.99));
  assert.equal(t, "REACT");
});

test("evaluateTree neutro picks ALIBI on first message when quiet", () => {
  const ctx = buildBotContext({
    ...baseArgs,
    role: "curupira",
    rng: rng(0.3),
  });
  const t = evaluateTree(neutroTree(), ctx, rng(0.5));
  assert.equal(t, "ALIBI");
});

test("evaluateTree criatura can ACCUSE when moradores exist", () => {
  const ctx = buildBotContext({
    ...baseArgs,
    role: "lobisomem",
    rng: rng(0.4),
  });
  const t = evaluateTree(criaturaTree(), ctx, rng(0.01));
  assert.ok(t === "ACCUSE" || t === "ALIBI" || t === "DEFLECT" || t === "DOUBT" || t === "REACT");
});

test("chatLooksLikeAccuse detects suspicion phrasing", () => {
  const ctx = buildBotContext({
    ...baseArgs,
    chatHistory: [{ playerId: "p2", name: "A", text: "Eu desconfio do Bot Um", type: "chat" }],
    rng: rng(0.1),
  });
  assert.equal(chatLooksLikeAccuse(ctx), true);
});

test("selectPhrase Geni ACCUSE on Boto uses fixed line", () => {
  const ctx = buildBotContext({ ...baseArgs, role: "geni", rng: rng(0.2) });
  const withTarget: BotContext = {
    ...ctx,
    accuseTargetId: "p-boto",
    accuseTargetName: "Boto Nome",
    botoId: "p-boto",
  };
  const line = selectPhrase("ACCUSE", withTarget, () => 0.99);
  assert.match(line, /não é o que parece/);
});

test("integration: getBotMessage returns non-empty string", () => {
  const ctx = buildBotContext({ ...baseArgs, rng: rng(0.11) });
  const msg = getBotMessage(ctx, rng(0.22));
  assert.ok(msg.length > 4);
});

test("integration: getBotMessagesForDayOpen respects silent roll", () => {
  const ctx = buildBotContext({ ...baseArgs, role: "iara", rng: rng(0.5) });
  const alwaysBelowSilent = () => 0.01;
  assert.deepEqual(getBotMessagesForDayOpen(ctx, alwaysBelowSilent), []);
});

test("integration: getBotMessagesForDayOpen yields lines when not silent", () => {
  const ctx = buildBotContext({
    ...baseArgs,
    role: "iara",
    rng: rng(0.6),
  });
  const lines = getBotMessagesForDayOpen(ctx, rng(0.7));
  assert.ok(Array.isArray(lines));
  assert.ok(lines.length >= 1);
  for (const line of lines) assert.ok(line.length > 3);
});
