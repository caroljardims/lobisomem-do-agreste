import type {
  DawnResolveInput,
  DawnResolveResult,
  IndividualWinEntry,
  NightActionInput,
  PlayerDawnState,
  PrivateLogEntry,
  PublicLogEntry,
} from "./types.js";
import {
  TARGET_BOTO_ENCHANTED,
  TARGET_BOTO_ENCHANT_FAILED,
  TARGET_CURUPIRA_PROTECTED,
  TARGET_DELEGADO_JAILED,
  TARGET_DOUTOR_SAVED,
  TARGET_GENI_CHARME,
  TARGET_GENI_CONVERSATION,
  TARGET_IARA_SEDUCED,
  TARGET_IARA_SEDUCE_FAILED,
  TARGET_INVESTIGATED_OBSERVED,
  TARGET_MULA_EXORCIZE_FAILED,
  TARGET_MULA_TERROR_FAILED,
  TARGET_MULA_TERRORIZED,
  TARGET_PADRE_CATECHIZED,
  TARGET_SACI_STOLEN,
  TARGET_SACI_STEAL_FAILED,
  TARGET_WOLF_BITTEN,
  TARGET_WOLF_PROTECTED,
  type QueuedPrivate,
} from "./dawnTargetExperience.js";
import { geniInvestigationsPriorToRound } from "./geniInvestigationHistory.js";
import type { RoleId } from "./types.js";
import { isCreatureRole, ROLE_SIDE } from "./roles.js";
import { displayRoleName } from "./roles.js";

export { DAY_PRIMER_ENCHANTED, DAY_PRIMER_SEDUCED } from "./dawnTargetExperience.js";

function clonePlayer(p: PlayerDawnState): PlayerDawnState {
  return { ...p };
}

function findPlayerIdByRole(
  players: Record<string, PlayerDawnState>,
  role: RoleId,
): string | undefined {
  for (const [id, p] of Object.entries(players)) {
    if (p.role === role && p.alive && !p.eliminated && !p.expelled) return id;
  }
  return undefined;
}

function getAction(
  actions: Record<string, import("./types.js").NightActionInput | undefined>,
  role: RoleId,
  players: Record<string, PlayerDawnState>,
): { playerId: string; action: import("./types.js").NightActionInput } | undefined {
  const pid = findPlayerIdByRole(players, role);
  if (!pid) return undefined;
  const a = actions[pid];
  if (!a) return undefined;
  return { playerId: pid, action: a };
}

/** Morador ou criatura para investigações (neutros tratados como morador aqui). */
function alignmentLabel(side: import("./types.js").Side): "criatura" | "morador" {
  return side === "criatura" ? "criatura" : "morador";
}

/** Rótulo para consulta do Cangaceiro à Geni (inclui neutros explícitos). */
function consultTriLabel(role: RoleId): "criatura" | "morador" | "neutro" {
  const side = ROLE_SIDE[role];
  if (side === "neutro") return "neutro";
  return side === "criatura" ? "criatura" : "morador";
}

function invertAlignment(label: "criatura" | "morador"): "criatura" | "morador" {
  return label === "criatura" ? "morador" : "criatura";
}

/** Jogadores que perderam a ação nesta noite por roubo do Saci na noite anterior. */
function priorNightSaciBlockedPlayerIds(input: DawnResolveInput): Set<string> {
  const s = new Set<string>();
  for (const [id, p] of Object.entries(input.players)) {
    if (p.blockedNextNight && p.nightAbilityBlockSource === "saci") s.add(id);
  }
  return s;
}

function passOnlyNightSubmission(a: NightActionInput): boolean {
  if (a.action === "pass") return true;
  return a.role === "delegado" && a.action === "jail" && !a.targetId;
}

function flushQueues(
  targetQueue: QueuedPrivate[],
  actorQueue: QueuedPrivate[],
  pushPrivate: (playerId: string, msg: string) => void,
) {
  for (const q of targetQueue) pushPrivate(q.playerId, q.message);
  for (const q of actorQueue) pushPrivate(q.playerId, q.message);
}

/**
 * Resolve o amanhecer conforme ordem do CLAUDE.md (efeitos visíveis + segredos).
 * Ordem de log privado: primeiro alvos (experiência), depois atores, depois Folhetim público.
 */
export function resolveDawn(input: DawnResolveInput): DawnResolveResult {
  const players: Record<string, PlayerDawnState> = {};
  for (const [id, p] of Object.entries(input.players)) {
    players[id] = clonePlayer(p);
    players[id].id = id;
    players[id].protected = false;
    players[id].seduced = false;
    players[id].jailed = false;
    players[id].enchanted = false;
    players[id].blockedNextNight = false;
    players[id].nightAbilityBlockSource = null;
    players[id].invoked = false;
    players[id].silenced = false;
    players[id].silencedRounds = 0;
  }

  const pendingPublic: PublicLogEntry[] = [];
  const targetQueue: QueuedPrivate[] = [];
  const actorQueue: QueuedPrivate[] = [];
  const individualWins: IndividualWinEntry[] = [];

  const privateLog: Record<string, PrivateLogEntry[]> = {};
  const pushPrivate = (playerId: string, msg: string) => {
    const e: PrivateLogEntry = {
      round: input.round,
      message: msg,
      timestamp: input.now,
    };
    privateLog[playerId] = privateLog[playerId] ?? [];
    privateLog[playerId].push(e);
  };

  const stolenFromPrior = priorNightSaciBlockedPlayerIds(input);
  const stolen = (playerId: string) => stolenFromPrior.has(playerId);

  const protectedTargets = new Set<string>();
  const cur = getAction(input.nightActions, "curupira", players);
  if (cur?.action.targetId && !stolen(cur.playerId)) {
    protectedTargets.add(cur.action.targetId);
    targetQueue.push({ playerId: cur.action.targetId, message: TARGET_CURUPIRA_PROTECTED });
  }
  const doc = getAction(input.nightActions, "doutor", players);
  if (doc?.action.targetId && !stolen(doc.playerId)) {
    protectedTargets.add(doc.action.targetId);
    targetQueue.push({ playerId: doc.action.targetId, message: TARGET_DOUTOR_SAVED });
  }
  const geniAction = getAction(input.nightActions, "geni", input.players);
  if (
    geniAction?.action.action === "charm" &&
    geniAction.action.targetId &&
    !stolen(geniAction.playerId)
  ) {
    protectedTargets.add(geniAction.action.targetId);
    targetQueue.push({ playerId: geniAction.action.targetId, message: TARGET_GENI_CHARME });
  }

  const padreAction = getAction(input.nightActions, "padre", players);
  const catechizedThisNight = new Set<string>();
  if (
    padreAction?.action.targetId &&
    players[padreAction.action.targetId] &&
    !stolen(padreAction.playerId) &&
    !protectedTargets.has(padreAction.action.targetId)
  ) {
    players[padreAction.action.targetId].catechized = true;
    catechizedThisNight.add(padreAction.action.targetId);
    targetQueue.push({ playerId: padreAction.action.targetId, message: TARGET_PADRE_CATECHIZED });
  }

  const saci = getAction(input.nightActions, "saci", players);
  if (
    saci &&
    !stolen(saci.playerId) &&
    saci.action.targetId &&
    players[saci.action.targetId] &&
    !protectedTargets.has(saci.action.targetId)
  ) {
    const victim = players[saci.action.targetId]!;
    victim.blockedNextNight = true;
    victim.nightAbilityBlockSource = "saci";
    targetQueue.push({ playerId: saci.action.targetId, message: TARGET_SACI_STOLEN });
  } else if (
    saci &&
    !stolen(saci.playerId) &&
    saci.action.targetId &&
    players[saci.action.targetId] &&
    protectedTargets.has(saci.action.targetId)
  ) {
    targetQueue.push({ playerId: saci.action.targetId, message: TARGET_SACI_STEAL_FAILED });
  }

  const mula = getAction(input.nightActions, "mula", players);
  if (
    mula &&
    !stolen(mula.playerId) &&
    mula.action.targetId &&
    players[mula.action.targetId] &&
    !protectedTargets.has(mula.action.targetId) &&
    !catechizedThisNight.has(mula.action.targetId)
  ) {
    const t = players[mula.action.targetId];
    if (mula.action.action === "exorcize") {
      t.alive = false;
      t.eliminated = true;
      pendingPublic.push({
        round: input.round,
        type: "death",
        message: `A cidade acorda com uma ausência. ${t.name} foi encontrado(a) sem vida. Era ${displayRoleName(t.role)}.`,
        timestamp: input.now,
      });
      if (t.role === "padre") {
        individualWins.push({
          playerId: mula.playerId,
          role: "mula",
          type: "mula_padre",
          round: input.round,
          timestamp: input.now,
        });
      }
    } else {
      t.silenced = true;
      t.silencedRounds = 1;
      pendingPublic.push({
        round: input.round,
        type: "terror",
        message: `${t.name} acorda em pânico. Ficará em silêncio durante a fase do dia.`,
        timestamp: input.now,
      });
      targetQueue.push({ playerId: mula.action.targetId, message: TARGET_MULA_TERRORIZED });
    }
  } else if (
    mula &&
    !stolen(mula.playerId) &&
    mula.action.targetId &&
    players[mula.action.targetId] &&
    mula.action.action === "exorcize" &&
    (protectedTargets.has(mula.action.targetId) || catechizedThisNight.has(mula.action.targetId))
  ) {
    targetQueue.push({ playerId: mula.action.targetId, message: TARGET_MULA_EXORCIZE_FAILED });
  } else if (
    mula &&
    !stolen(mula.playerId) &&
    mula.action.targetId &&
    players[mula.action.targetId] &&
    mula.action.action === "terrorize" &&
    (protectedTargets.has(mula.action.targetId) || catechizedThisNight.has(mula.action.targetId))
  ) {
    targetQueue.push({ playerId: mula.action.targetId, message: TARGET_MULA_TERROR_FAILED });
  }

  const boto = getAction(input.nightActions, "boto", players);
  if (
    boto &&
    !stolen(boto.playerId) &&
    boto.action.targetId &&
    players[boto.action.targetId] &&
    !protectedTargets.has(boto.action.targetId)
  ) {
    players[boto.action.targetId].enchanted = true;
    targetQueue.push({ playerId: boto.action.targetId, message: TARGET_BOTO_ENCHANTED });
  } else if (
    boto &&
    !stolen(boto.playerId) &&
    boto.action.targetId &&
    players[boto.action.targetId] &&
    protectedTargets.has(boto.action.targetId)
  ) {
    targetQueue.push({ playerId: boto.action.targetId, message: TARGET_BOTO_ENCHANT_FAILED });
  }

  const iara = getAction(input.nightActions, "iara", players);
  if (
    iara &&
    !stolen(iara.playerId) &&
    iara.action.targetId &&
    players[iara.action.targetId] &&
    !protectedTargets.has(iara.action.targetId) &&
    !catechizedThisNight.has(iara.action.targetId)
  ) {
    const t = players[iara.action.targetId];
    if (iara.action.action === "eliminate_special") {
      t.alive = false;
      t.eliminated = true;
      pendingPublic.push({
        round: input.round,
        type: "death",
        message: `A cidade acorda com uma ausência. ${t.name} foi encontrado(a) sem vida. Era ${displayRoleName(t.role)}.`,
        timestamp: input.now,
      });
      if (t.role === "delegado") {
        individualWins.push({
          playerId: iara.playerId,
          role: "iara",
          type: "iara_delegado",
          round: input.round,
          timestamp: input.now,
        });
      }
      players[iara.playerId].iaraSeductionBlockedThroughRound = input.round + 2;
    } else if (iara.action.action === "seduce") {
      t.seduced = true;
      targetQueue.push({ playerId: iara.action.targetId, message: TARGET_IARA_SEDUCED });
    }
  } else if (
    iara &&
    !stolen(iara.playerId) &&
    iara.action.targetId &&
    players[iara.action.targetId] &&
    iara.action.action === "seduce" &&
    (protectedTargets.has(iara.action.targetId) || catechizedThisNight.has(iara.action.targetId))
  ) {
    targetQueue.push({ playerId: iara.action.targetId, message: TARGET_IARA_SEDUCE_FAILED });
  }

  const wolf = getAction(input.nightActions, "lobisomem", players);
  let biteAnnounced = false;
  if (wolf?.action.targetId && !stolen(wolf.playerId)) {
    const tid = wolf.action.targetId;
    const target = players[tid];
    if (target) {
      const immuneMula = target.role === "mula";
      const immuneMae = target.role === "mae_de_santo";
      const immuneBras = target.role === "bras_cubas";
      const immuneCang = target.role === "cangaceiro";
      const immuneBoitata = target.role === "boitata";
      if (immuneMula || immuneMae || immuneBras || immuneCang || immuneBoitata) {
        actorQueue.push({ playerId: wolf.playerId, message: "O alvo não pôde ser tocado." });
      } else if (protectedTargets.has(tid)) {
        targetQueue.push({ playerId: tid, message: TARGET_WOLF_PROTECTED });
      } else if (wolf.action.action === "eliminate") {
        target.alive = false;
        target.eliminated = true;
        pendingPublic.push({
          round: input.round,
          type: "death",
          message: `A cidade acorda com uma ausência. ${target.name} foi encontrado(a) sem vida. Era ${displayRoleName(target.role)}.`,
          timestamp: input.now,
        });
      } else if (wolf.action.action === "bite") {
        biteAnnounced = true;
        targetQueue.push({ playerId: tid, message: TARGET_WOLF_BITTEN });
      }
    }
  }

  if (biteAnnounced) {
    pendingPublic.push({
      round: input.round,
      type: "bite",
      message:
        "Há marcas estranhas na cidade. Alguém foi tocado pelo folclore essa noite — mas ainda respira.",
      timestamp: input.now,
    });
  }

  const mae = getAction(input.nightActions, "mae_de_santo", players);
  if (mae?.action.targetId && players[mae.action.targetId] && !stolen(mae.playerId)) {
    const t = players[mae.action.targetId];
    if (!t.alive && t.eliminated) {
      t.invoked = true;
      pendingPublic.push({
        round: input.round,
        type: "invocation",
        message: `Uma presença retorna por mais um dia. ${t.name} tem algo a dizer.`,
        timestamp: input.now,
      });
    }
  }

  const cart = getAction(input.nightActions, "cartomante", players);
  if (cart?.action.targetId && players[cart.action.targetId] && !stolen(cart.playerId)) {
    const t = players[cart.action.targetId];
    let label = alignmentLabel(ROLE_SIDE[t.role]);
    if (t.role === "curupira") label = invertAlignment(label);
    actorQueue.push({ playerId: cart.playerId, message: `Sua investigação: ${t.name} é ${label}.` });
    targetQueue.push({ playerId: cart.action.targetId, message: TARGET_INVESTIGATED_OBSERVED });
  }

  const boi = getAction(input.nightActions, "boitata", players);
  if (boi?.action.targetId && players[boi.action.targetId] && !stolen(boi.playerId)) {
    const t = players[boi.action.targetId];
    let label = alignmentLabel(ROLE_SIDE[t.role]);
    if (t.role === "curupira") label = invertAlignment(label);
    actorQueue.push({ playerId: boi.playerId, message: `Sua investigação: ${t.name} é ${label}.` });
    targetQueue.push({ playerId: boi.action.targetId, message: TARGET_INVESTIGATED_OBSERVED });
  }

  const del = getAction(input.nightActions, "delegado", players);
  if (del && players[del.playerId]) {
    const dPlayer = players[del.playerId]!;
    const isPass =
      del.action.action === "pass" || (del.action.action === "jail" && !del.action.targetId);
    if (isPass) {
      dPlayer.delegadoLastJailedId = null;
    } else if (
      !stolen(del.playerId) &&
      del.action.action === "jail" &&
      del.action.targetId &&
      players[del.action.targetId]
    ) {
      const t = players[del.action.targetId]!;
      t.jailed = true;
      dPlayer.delegadoLastJailedId = del.action.targetId;
      const reason = del.action.specialAction?.trim();
      const msg = reason
        ? `O Delegado ordenou a prisão de ${t.name}. Motivo: ${reason}.`
        : `O Delegado ordenou a prisão de ${t.name}.`;
      pendingPublic.push({ round: input.round, type: "special", message: msg, timestamp: input.now });
      targetQueue.push({ playerId: del.action.targetId, message: TARGET_DELEGADO_JAILED });
    }
  }

  if (
    geniAction?.action.action === "converse" &&
    geniAction.action.targetId &&
    players[geniAction.action.targetId] &&
    !stolen(geniAction.playerId)
  ) {
    const t = players[geniAction.action.targetId];
    const lab = isCreatureRole(t.role) ? "criatura" : "morador";
    actorQueue.push({
      playerId: geniAction.playerId,
      message: `A conversa revela: ${t.name} é ${lab}.`,
    });

    if (t.role === "cangaceiro") {
      const fullHistory = input.geniInvestigatedIds[geniAction.playerId] ?? [];
      const priorOnly = geniInvestigationsPriorToRound(fullHistory, input.round);
      const parts: string[] = [];
      for (const entry of priorOnly) {
        const inv = players[entry.playerId];
        if (!inv) continue;
        const nature = isCreatureRole(inv.role) ? "criatura" : "morador";
        parts.push(`${inv.name} (${nature})`);
      }
      const listText =
        parts.length > 0 ? parts.join(", ") : "ninguém ainda — esta foi a primeira conversa dela na cidade";
      actorQueue.push({
        playerId: geniAction.action.targetId,
        message: `Geni passou a noite com você. Ela já sabe sobre: ${listText}.`,
      });
    } else {
      targetQueue.push({ playerId: geniAction.action.targetId, message: TARGET_GENI_CONVERSATION });
    }
  }

  const cang = getAction(input.nightActions, "cangaceiro", players);
  if (
    cang?.action.action === "query" &&
    cang.action.targetId &&
    players[cang.action.targetId] &&
    !stolen(cang.playerId)
  ) {
    const t = players[cang.action.targetId];
    const geniPid = findPlayerIdByRole(players, "geni");
    const geniHistory = geniPid ? (input.geniInvestigatedIds[geniPid] ?? []) : [];
    const prior = geniInvestigationsPriorToRound(geniHistory, input.round);
    const investigated =
      Boolean(geniPid) && prior.some((e) => e.playerId === cang.action.targetId);
    if (investigated) {
      const lab = consultTriLabel(t.role);
      actorQueue.push({
        playerId: cang.playerId,
        message: `Geni já conversou com ${t.name}. É ${lab}.`,
      });
    } else if (geniPid) {
      actorQueue.push({
        playerId: cang.playerId,
        message: `Geni ainda não conversou com ${t.name}. Tente de novo quando ela souber mais.`,
      });
    }
  }

  const visible = pendingPublic.filter((e) => e.type !== "dawn");
  if (visible.length === 0) {
    pendingPublic.push({
      round: input.round,
      type: "dawn",
      message: "A noite passou em silêncio. Mas o silêncio, aqui, nunca é inocente.",
      timestamp: input.now,
    });
  }

  let dawnSummary: DawnResolveResult["dawnSummary"] = "none";
  if (pendingPublic.some((e) => e.type === "death")) dawnSummary = "death";
  else if (pendingPublic.some((e) => e.type === "bite")) dawnSummary = "bite";
  else if (pendingPublic.some((e) => e.type === "terror")) dawnSummary = "terror";
  else if (pendingPublic.some((e) => e.type === "invocation")) dawnSummary = "invocation";

  if (doc?.action.targetId && !stolen(doc.playerId)) {
    const d = players[doc.playerId];
    if (d) d.doctorLastTargetId = doc.action.targetId;
  }

  for (const pid of stolenFromPrior) {
    const act = input.nightActions[pid];
    if (!act || passOnlyNightSubmission(act)) continue;
    actorQueue.push({
      playerId: pid,
      message: "O Saci Pererê roubou sua habilidade nesta noite. Sua ação não surtiu efeito.",
    });
  }

  flushQueues(targetQueue, actorQueue, pushPrivate);

  const publicLog = pendingPublic;

  return { players, publicLog, privateLog, individualWins, dawnSummary };
}
