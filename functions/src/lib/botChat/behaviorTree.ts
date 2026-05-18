import type { BotContext, BehaviorNode, MessageType, Rng } from "./types.js";

export function chatLooksLikeAccuse(ctx: BotContext): boolean {
  const needles = ["desconfi", "acho que", "suspeit", "olhem pra", "quieto demais", "não tô convenc", "vou votar", "voto"];
  for (const m of ctx.chatHistory) {
    if (m.type === "vote") continue;
    const t = m.text.toLowerCase();
    if (needles.some((n) => t.includes(n))) return true;
  }
  return false;
}

function silentNonSelfExists(ctx: BotContext): boolean {
  const spoken = new Set(ctx.chatHistory.map((m) => m.playerId));
  return ctx.livingPlayers.some((p) => p.id !== ctx.selfPlayerId && !spoken.has(p.id));
}

function livingMoradoresExist(ctx: BotContext): boolean {
  return ctx.livingPlayers.some((p) => p.side === "morador" && p.id !== ctx.selfPlayerId);
}

/** Alvo provável pelo lado atual do neutro (praça × folclore). */
function livingOpposingNeutral(ctx: BotContext): boolean {
  const a = ctx.alignmentChosen;
  const wantTown = a === "moradores";
  return ctx.livingPlayers.some((p) => {
    if (p.id === ctx.selfPlayerId) return false;
    if (!wantTown) return p.side === "morador";
    return p.side === "criatura";
  });
}

function seq(...children: BehaviorNode[]): BehaviorNode {
  return { kind: "sequence", children };
}

function sel(...children: BehaviorNode[]): BehaviorNode {
  return { kind: "selector", children };
}

function cond(test: (ctx: BotContext) => boolean): BehaviorNode {
  return { kind: "condition", test };
}

function act(messageType: MessageType): BehaviorNode {
  return { kind: "action", messageType };
}

function rand(p: number): BehaviorNode {
  return { kind: "randomPass", p };
}

/** Praça — conhecimento primeiro, depois heurísticas sociais. */
export function moradorTree(): BehaviorNode {
  return sel(
    seq(cond((c) => c.semanticAccusesConfirmedEnemy), act("AGREE")),
    seq(cond((c) => c.hasConfirmedEnemyAlive), act("ACCUSE")),
    seq(cond((c) => Boolean(c.victim)), act("REACT")),
    seq(cond((c) => c.wasAccusedBy != null), act("DEFEND")),
    seq(cond((c) => c.messageIndex === 0 && !c.victim), act("ALIBI")),
    seq(cond((c) => (c.botKnowledge?.suspectedEnemiesWeighted.length ?? 0) > 0 || c.suspectedPlayers.length > 0), act("ACCUSE")),
    seq(cond((c) => chatLooksLikeAccuse(c)), act("AGREE")),
    seq(cond((c) => c.messageIndex >= 1 && silentNonSelfExists(c)), act("DOUBT")),
    act("DEFLECT"),
  );
}

/** Folclore — pressionar moradores, sem esquecer conhecimento. */
export function criaturaTree(): BehaviorNode {
  return sel(
    seq(cond((c) => c.semanticAccusesConfirmedEnemy), rand(0.55), act("AGREE")),
    seq(cond((c) => c.hasConfirmedEnemyAlive), act("ACCUSE")),
    seq(cond((c) => Boolean(c.victim)), act("REACT")),
    seq(cond((c) => c.wasAccusedBy != null), sel(seq(rand(0.55), act("ACCUSE")), act("DEFEND"))),
    seq(cond((c) => c.roundNumber <= 2 && c.messageIndex === 0), act("ALIBI")),
    seq(cond(livingMoradoresExist), act("ACCUSE")),
    seq(cond((c) => chatLooksLikeAccuse(c)), rand(0.45), act("DOUBT")),
    seq(cond((c) => c.roundNumber >= 3), act("DOUBT")),
    act("DEFLECT"),
  );
}

/** Neutros — comportamento misto até alinhamento; depois conflito claro. */
export function neutroTree(): BehaviorNode {
  return sel(
    seq(cond((c) => c.hasConfirmedEnemyAlive && (c.alignmentChosen === "moradores" || c.alignmentChosen === "criaturas")), act("ACCUSE")),
    seq(cond((c) => Boolean(c.victim)), act("REACT")),
    seq(cond((c) => c.wasAccusedBy != null), act("DEFEND")),
    seq(cond((c) => Boolean(c.alignmentChosen) && livingOpposingNeutral(c)), rand(0.35), act("ACCUSE")),
    seq(cond(chatLooksLikeAccuse), act("DOUBT")),
    seq(cond((c) => c.messageIndex === 0), act("ALIBI")),
    seq(cond((c) => c.messageIndex >= 1), rand(0.45), act("AGREE")),
    act("DEFLECT"),
  );
}

/** Boitatá: primeira mensagem pode ser mais cética. */
function boitataTree(): BehaviorNode {
  return sel(
    seq(cond((c) => c.messageIndex === 0 && Boolean(c.victim)), act("REACT")),
    seq(cond((c) => c.messageIndex === 0), act("DOUBT")),
    neutroTree(),
  );
}

function maeDeSantoTree(): BehaviorNode {
  return sel(
    seq(cond((c) => c.roundNumber === 1 && c.messageIndex === 0), act("ALIBI")),
    moradorTree(),
  );
}

export function getBaseTree(side: "criatura" | "morador" | "neutro"): BehaviorNode {
  if (side === "criatura") return criaturaTree();
  if (side === "neutro") return neutroTree();
  return moradorTree();
}

export function getBehaviorRoot(ctx: BotContext): BehaviorNode {
  if (ctx.role === "boitata") return boitataTree();
  if (ctx.role === "mae_de_santo") return maeDeSantoTree();
  return getBaseTree(ctx.side);
}

function trySequence(node: Extract<BehaviorNode, { kind: "sequence" }>, ctx: BotContext, rng: Rng): MessageType | null {
  for (const child of node.children) {
    if (child.kind === "condition") {
      if (!child.test(ctx)) return null;
    } else if (child.kind === "randomPass") {
      if (rng() >= child.p) return null;
    } else if (child.kind === "action") {
      return child.messageType;
    } else if (child.kind === "selector") {
      const inner = evaluateSelector(child, ctx, rng);
      if (inner == null) return null;
      return inner;
    } else if (child.kind === "sequence") {
      const inner = trySequence(child, ctx, rng);
      if (inner == null) return null;
      return inner;
    }
  }
  return null;
}

function evaluateSelector(node: Extract<BehaviorNode, { kind: "selector" }>, ctx: BotContext, rng: Rng): MessageType | null {
  for (const child of node.children) {
    if (child.kind === "sequence") {
      const r = trySequence(child, ctx, rng);
      if (r != null) return r;
    } else if (child.kind === "action") {
      return child.messageType;
    } else if (child.kind === "selector") {
      const r = evaluateSelector(child, ctx, rng);
      if (r != null) return r;
    }
  }
  return null;
}

export function evaluateTree(root: BehaviorNode, ctx: BotContext, rng: Rng): MessageType | null {
  if (root.kind === "selector") return evaluateSelector(root, ctx, rng);
  if (root.kind === "sequence") return trySequence(root, ctx, rng);
  if (root.kind === "action") return root.messageType;
  return null;
}
