import type { BotChatSegment, BotContext, ChatSemanticKindTagged, MessageType, Rng } from "./types.js";
import { evaluateTree, getBehaviorRoot } from "./behaviorTree.js";
import { getCharacterConfig } from "./characterConfigs.js";
import { prioritizeByThreat, playerFightsForTownTeam } from "../botKnowledge/selectVoteTarget.js";
import { selectPhrase } from "./phraseSelection.js";

function remapRoleMessageType(role: BotContext["role"], t: MessageType): MessageType {
  if (role === "saci" && t === "DEFEND") return "DEFLECT";
  if (role === "boto" && t === "ACCUSE") return "DOUBT";
  if (role === "bras_cubas" && t === "DEFEND") return "DEFLECT";
  return t;
}

function alignedOppositePool(ctx: BotContext): BotContext["livingPlayers"] {
  const others = ctx.livingPlayers.filter((p) => p.id !== ctx.selfPlayerId);
  const a = ctx.alignmentChosen;
  if (!a) return others;
  if (a === "moradores") return others.filter((p) => p.side === "criatura");
  return others.filter((p) => p.side === "morador");
}

export function pickAccuseTarget(ctx: BotContext, type: MessageType, rng: Rng): BotContext {
  const kb = ctx.botKnowledge;
  const others = ctx.livingPlayers.filter((p) => p.id !== ctx.selfPlayerId);

  if (type === "DEFEND") {
    if (!ctx.wasAccusedBy) {
      return { ...ctx, accuseTargetId: null, accuseTargetName: null };
    }
    const acc = ctx.livingPlayers.find((p) => p.id === ctx.wasAccusedBy);
    return {
      ...ctx,
      accuseTargetId: acc?.id ?? null,
      accuseTargetName: acc?.name ?? null,
    };
  }

  if (type !== "ACCUSE" && type !== "AGREE" && type !== "DOUBT") {
    return { ...ctx, accuseTargetId: null, accuseTargetName: null };
  }

  const fightTown = playerFightsForTownTeam(ctx.role, ctx.alignmentChosen);
  const livingIds = new Set(ctx.livingPlayers.map((p) => p.id));

  const confirmedAlive =
    kb?.confirmedEnemies.filter((id) => livingIds.has(id) && id !== ctx.selfPlayerId) ?? [];

  const pickFromConfirmed = (): BotContext => {
    if (!confirmedAlive.length) return ctx;
    const id =
      fightTown != null
        ? prioritizeByThreat({
            candidateIds: confirmedAlive,
            enemyRoleKnown: kb?.enemyRoleKnown ?? {},
            botFightsForTown: fightTown,
            rng,
          })
        : confirmedAlive[Math.floor(rng() * confirmedAlive.length)]!;
    const row = ctx.livingPlayers.find((p) => p.id === id);
    return { ...ctx, accuseTargetId: id, accuseTargetName: row?.name ?? id };
  };

  const pickSuspectWeighted = (): BotContext => {
    const pool = [...(kb?.suspectedEnemiesWeighted ?? [])]
      .filter((x) => livingIds.has(x.playerId) && x.playerId !== ctx.selfPlayerId)
      .sort((a, b) => b.weight - a.weight || rng() - 0.5);
    if (pool.length && pool[0]!.weight > 0) {
      const pick = pool[0]!;
      const row = ctx.livingPlayers.find((p) => p.id === pick.playerId);
      return { ...ctx, accuseTargetId: pick.playerId, accuseTargetName: row?.name ?? pick.playerId };
    }
    if (confirmedAlive.length) return pickFromConfirmed();
    return ctx;
  };

  const pickVoteAgainstMe = (): BotContext | null => {
    const ids = kb?.votedAgainstMe.filter((id) => livingIds.has(id) && id !== ctx.selfPlayerId) ?? [];
    if (!ids.length) return null;
    const id = ids[Math.floor(rng() * ids.length)]!;
    const row = ctx.livingPlayers.find((p) => p.id === id);
    return { ...ctx, accuseTargetId: id, accuseTargetName: row?.name ?? id };
  };

  if ((type === "ACCUSE" || type === "AGREE") && ctx.role !== "saci") {
    if (confirmedAlive.length) return pickFromConfirmed();
    const weighted = pickSuspectWeighted();
    if (weighted.accuseTargetId) return weighted;
    const vag = pickVoteAgainstMe();
    if (vag?.accuseTargetId) return vag;
  }

  let pool = others;
  if (type === "DOUBT") {
    const spoken = new Set(ctx.chatHistory.map((m) => m.playerId));
    const silent = pool.filter((p) => !spoken.has(p.id));
    if (silent.length) pool = silent;
  }

  if (ctx.role === "saci") {
    pool = others;
  } else if (ctx.side === "criatura") {
    const ms = pool.filter((p) => p.side === "morador");
    if (ms.length) pool = ms;
  } else if (ctx.side === "neutro") {
    const aligned = alignedOppositePool(ctx);
    const ids = new Set(aligned.map((p) => p.id));
    const narrowed = pool.filter((p) => ids.has(p.id));
    pool = narrowed.length ? narrowed : aligned;
  }

  if (ctx.role === "geni" && ctx.botoId && pool.some((p) => p.id === ctx.botoId) && rng() < 0.75) {
    const b = pool.find((p) => p.id === ctx.botoId)!;
    return { ...ctx, accuseTargetId: b.id, accuseTargetName: b.name };
  }
  if (ctx.role === "cangaceiro" && ctx.iaraId && pool.some((p) => p.id === ctx.iaraId) && rng() < 0.75) {
    const x = pool.find((p) => p.id === ctx.iaraId)!;
    return { ...ctx, accuseTargetId: x.id, accuseTargetName: x.name };
  }
  if (ctx.role === "mula" && ctx.padreId && pool.some((p) => p.id === ctx.padreId) && rng() < 0.65) {
    const priest = pool.find((y) => y.id === ctx.padreId)!;
    return { ...ctx, accuseTargetId: priest.id, accuseTargetName: priest.name };
  }

  const suspectPool = pool.filter((p) => ctx.suspectedPlayers.includes(p.id));
  if (suspectPool.length && (type === "ACCUSE" || rng() < 0.52)) pool = suspectPool;

  const vagLate = rng() < 0.35 && ctx.role !== "saci" ? pickVoteAgainstMe() : null;
  if (vagLate?.accuseTargetId) return vagLate;

  const fallback = pool.length ? pool : others;
  const pick = fallback[Math.floor(rng() * fallback.length)]!;
  return { ...ctx, accuseTargetId: pick.id, accuseTargetName: pick.name };
}

const FALLBACK_ORDER: MessageType[] = ["DOUBT", "REACT", "ACCUSE", "ALIBI", "DEFEND", "AGREE", "DEFLECT"];

export function runBotBehavior(ctx: BotContext, rng: Rng): MessageType | null {
  const root = getBehaviorRoot(ctx);
  let t = evaluateTree(root, ctx, rng);
  if (t == null) return null;
  t = remapRoleMessageType(ctx.role, t);
  const weights = getCharacterConfig(ctx.role).weights;
  const ex = new Set(ctx.excludeTypes ?? []);
  if (!ex.has(t) && weights[t] > 0) return t;
  for (const alt of FALLBACK_ORDER) {
    if (weights[alt] > 0 && !ex.has(alt)) return alt;
  }
  for (const alt of FALLBACK_ORDER) {
    if (weights[alt] > 0) return alt;
  }
  return null;
}

function segmentSemantics(
  messageType: MessageType,
  ctxWithTarget: BotContext,
): { kind?: ChatSemanticKindTagged; target?: string | null } {
  if (messageType === "ACCUSE" || messageType === "AGREE" || messageType === "DOUBT") {
    return { kind: "accuse", target: ctxWithTarget.accuseTargetId };
  }
  if (messageType === "DEFEND") {
    return { kind: "defend", target: ctxWithTarget.accuseTargetId ?? ctxWithTarget.selfPlayerId };
  }
  return {};
}

export function getBotMessage(ctx: BotContext, rng: Rng): string {
  const t = runBotBehavior(ctx, rng);
  if (t == null) return "Calma, gente. Vamos com calma.";
  const withTarget = pickAccuseTarget(ctx, t, rng);
  return selectPhrase(t, withTarget, rng);
}

/** Compat: só texto por mensagem (sem marcação semântica). */
export function getBotMessagesForDayOpen(ctx: BotContext, rng: Rng): string[] {
  return getBotSegmentsForDayOpen(ctx, rng).map((s) => s.text);
}

export function getBotSegmentsForDayOpen(ctx: BotContext, rng: Rng): BotChatSegment[] {
  const cfg = getCharacterConfig(ctx.role);
  if (rng() < cfg.silentRate) return [];
  const n = Math.max(1, Math.min(cfg.maxMessages, 1 + Math.floor(rng() * cfg.maxMessages)));
  const out: BotChatSegment[] = [];
  for (let i = 0; i < n; i++) {
    const pieceCtx = { ...ctx, messageIndex: i };
    let t = runBotBehavior(pieceCtx, rng);
    if (t == null) continue;
    t = remapRoleMessageType(ctx.role, t);
    const withTarget = pickAccuseTarget(pieceCtx, t, rng);
    const phrase = selectPhrase(t, withTarget, rng);
    const { kind, target } = segmentSemantics(t, withTarget);
    out.push({
      text: phrase,
      ...(kind ? { semanticKind: kind, semanticTargetId: target ?? null } : {}),
    });
  }
  return out;
}
