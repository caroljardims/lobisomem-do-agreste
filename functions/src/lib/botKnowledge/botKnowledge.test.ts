import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerDawnState } from "folclore-game-engine";

import { mergeBotKnowledgeFromNightResolve } from "./applyFromNightResolve.js";
import { addConfirmedEnemy, bumpEnemySuspect, parseBotKnowledge, promoteSuspects } from "./merge.js";
import { emptyBotKnowledge } from "./types.js";
import { selectVoteTarget } from "./selectVoteTarget.js";

function st(role: PlayerDawnState["role"], id: string): PlayerDawnState {
  return {
    id,
    name: id,
    role,
    side: role === "lobisomem" ? "criatura" : "morador",
    alive: true,
    eliminated: false,
    expelled: false,
    blockedNextNight: false,
    nightAbilityBlockSource: null,
    silenced: false,
    silencedRounds: 0,
    enchanted: false,
    seduced: false,
    jailed: false,
    protected: false,
    invoked: false,
    doctorLastTargetId: null,
    delegadoLastJailedId: null,
    wolfBiteUsed: false,
    mulaExorcizeUsed: false,
    geniCharmUsed: false,
    catechized: false,
    iaraSeductionBlockedThroughRound: null,
  };
}

test("promoteSuspects promotes weight >= 2 to confirmed enemy", () => {
  const k = emptyBotKnowledge();
  bumpEnemySuspect(k, "x", 2);
  promoteSuspects(k);
  assert.ok(k.confirmedEnemies.includes("x"));
  assert.equal(k.suspectedEnemiesWeighted.find((w) => w.playerId === "x")?.weight ?? 0, 0);
});

test("selectVoteTarget prefers confirmed criatura quando aldeão vota", () => {
  const kb = parseBotKnowledge(null);
  addConfirmedEnemy(kb, "wolf");
  const alive: Array<{ id: string; state: PlayerDawnState }> = [
    { id: "me", state: st("aldeao", "me") },
    { id: "wolf", state: st("lobisomem", "wolf") },
    { id: "town", state: st("aldeao", "town") },
  ];
  const { targetId } = selectVoteTarget({
    rng: () => 0.1,
    voterId: "me",
    kb,
    voterRole: "aldeao",
    voterAlign: undefined,
    aliveEntries: alive,
    canTarget: (pid, tst) =>
      tst.alive && !tst.eliminated && !tst.expelled && pid !== "me",
  });
  assert.equal(targetId, "wolf");
});

test("merge dawn: investigação Cartomante grava confirmed enemy quando rótulo fecha com aldeão", () => {
  const kb = parseBotKnowledge(null);
  const kbMap = new Map([["cart", kb]]);
  const dawnBefore: Record<string, PlayerDawnState> = {
    cart: st("cartomante", "cart"),
    cri: st("lobisomem", "cri"),
  };
  const resAfter = { ...dawnBefore };
  const secrets = {
    cart: { role: "cartomante" as const, side: "morador" as const },
    cri: { role: "lobisomem" as const, side: "criatura" as const },
  };
  mergeBotKnowledgeFromNightResolve({
    round: 1,
    dawnPlayersBefore: dawnBefore,
    resPlayersAfter: resAfter,
    nightActions: {
      cart: {
        role: "cartomante",
        action: "investigate",
        targetId: "cri",
        specialAction: null,
      },
    },
    secrets,
    playerRowsById: new Map([
      ["cart", { id: "cart", alignment: undefined }],
    ]) as Map<string, Record<string, unknown> & { id: string; alignment?: string }>,
    botIds: new Set(["cart"]),
    geniPid: undefined,
    geniInvestigatedIds: {},
    privateLogNew: {},
    kbByBotId: kbMap,
  });
  assert.ok(kb.confirmedEnemies.includes("cri"));
});
