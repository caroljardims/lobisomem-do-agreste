import type {
  DawnResolveInput,
  DawnResolveResult,
  IndividualWinEntry,
  PlayerDawnState,
  PrivateLogEntry,
  PublicLogEntry,
} from "./types.js";
import type { RoleId } from "./types.js";
import { isCreatureRole, ROLE_SIDE } from "./roles.js";
import { displayRoleName } from "./roles.js";

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

function invertAlignment(label: "criatura" | "morador"): "criatura" | "morador" {
  return label === "criatura" ? "morador" : "criatura";
}

/**
 * Resolve o amanhecer conforme ordem do CLAUDE.md (efeitos visíveis + segredos).
 */
export function resolveDawn(input: DawnResolveInput): DawnResolveResult {
  const players: Record<string, PlayerDawnState> = {};
  for (const [id, p] of Object.entries(input.players)) {
    players[id] = clonePlayer(p);
    players[id].id = id;
    // Reset per-round status effects — re-applied below only if this night's actions set them
    players[id].protected = false;
    players[id].seduced = false;
    players[id].jailed = false;
    players[id].enchanted = false;
    players[id].blockedNextNight = false;
    players[id].invoked = false;
    players[id].silenced = false;
    players[id].silencedRounds = 0;
  }

  const publicLog: PublicLogEntry[] = [];
  const privateLog: Record<string, PrivateLogEntry[]> = {};
  const individualWins: IndividualWinEntry[] = [];
  const pushPrivate = (playerId: string, msg: string) => {
    const e: PrivateLogEntry = {
      round: input.round,
      message: msg,
      timestamp: input.now,
    };
    privateLog[playerId] = privateLog[playerId] ?? [];
    privateLog[playerId].push(e);
  };

  // --- 1. Compute protected targets (Curupira + Doutor + Geni Charme de Verdade) ---
  const protectedTargets = new Set<string>();
  const cur = getAction(input.nightActions, "curupira", players);
  if (cur?.action.targetId) protectedTargets.add(cur.action.targetId);
  const doc = getAction(input.nightActions, "doutor", players);
  if (doc?.action.targetId) protectedTargets.add(doc.action.targetId);
  const geniAction = getAction(input.nightActions, "geni", input.players);
  if (geniAction?.action.action === "charm" && geniAction.action.targetId) {
    protectedTargets.add(geniAction.action.targetId);
  }

  // --- 2. Padre — catechize (protection from Mula/Iara this night) ---
  const padreAction = getAction(input.nightActions, "padre", input.players);
  const catechizedThisNight = new Set<string>();
  if (padreAction?.action.targetId && players[padreAction.action.targetId]) {
    const catTarget = players[padreAction.action.targetId];
    catTarget.catechized = true;
    catechizedThisNight.add(padreAction.action.targetId);
  }

  // --- 3. Saci — block next night (fails if target protected) ---
  const saci = getAction(input.nightActions, "saci", players);
  if (saci?.action.targetId && players[saci.action.targetId] && !protectedTargets.has(saci.action.targetId)) {
    players[saci.action.targetId].blockedNextNight = true;
  }

  // --- 4. Mula — terrorize or exorcize (fails if protected or catechized) ---
  const mula = getAction(input.nightActions, "mula", input.players);
  if (mula?.action.targetId && players[mula.action.targetId] &&
      !protectedTargets.has(mula.action.targetId) && !catechizedThisNight.has(mula.action.targetId)) {
    const t = players[mula.action.targetId];
    if (mula.action.action === "exorcize") {
      t.alive = false;
      t.eliminated = true;
      publicLog.push({
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
      publicLog.push({
        round: input.round,
        type: "terror",
        message: `${t.name} acorda em pânico. Ficará em silêncio durante a fase do dia.`,
        timestamp: input.now,
      });
    }
  }

  // --- 5. Boto — enchant (fails if protected) ---
  const boto = getAction(input.nightActions, "boto", input.players);
  if (boto?.action.targetId && players[boto.action.targetId] && !protectedTargets.has(boto.action.targetId)) {
    players[boto.action.targetId].enchanted = true;
  }

  // --- 6. Iara — seduce or Voz Encantadora (fails if protected or catechized) ---
  const iara = getAction(input.nightActions, "iara", input.players);
  if (iara?.action.targetId && players[iara.action.targetId] &&
      !protectedTargets.has(iara.action.targetId) && !catechizedThisNight.has(iara.action.targetId)) {
    const t = players[iara.action.targetId];
    if (iara.action.action === "eliminate_special") {
      t.alive = false;
      t.eliminated = true;
      publicLog.push({
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
    }
  }

  const wolf = getAction(input.nightActions, "lobisomem", input.players);
  let biteAnnounced = false;
  if (wolf?.action.targetId) {
    const tid = wolf.action.targetId;
    const target = players[tid];
    if (target) {
      const immuneMula = target.role === "mula";
      const immuneMae = target.role === "mae_de_santo";
      const immuneBras = target.role === "bras_cubas";
      const immuneCang = target.role === "cangaceiro";
      const immuneBoitata = target.role === "boitata";
      if (immuneMula || immuneMae || immuneBras || immuneCang || immuneBoitata) {
        pushPrivate(wolf.playerId, "O alvo não pôde ser tocado.");
      } else if (protectedTargets.has(tid)) {
        // falha — nada público
      } else if (wolf.action.action === "eliminate") {
        target.alive = false;
        target.eliminated = true;
        publicLog.push({
          round: input.round,
          type: "death",
          message: `A cidade acorda com uma ausência. ${target.name} foi encontrado(a) sem vida. Era ${displayRoleName(target.role)}.`,
          timestamp: input.now,
        });
      } else if (wolf.action.action === "bite") {
        const savedByDoctor = doc?.action.targetId === tid;
        if (!savedByDoctor) {
          biteAnnounced = true;
          pushPrivate(tid, "Você foi mordido. Há consequências secretas nesta partida.");
        }
      }
    }
  }

  if (biteAnnounced) {
    publicLog.push({
      round: input.round,
      type: "bite",
      message:
        "Há marcas estranhas na cidade. Alguém foi tocado pelo folclore essa noite — mas ainda respira.",
      timestamp: input.now,
    });
  }

  const mae = getAction(input.nightActions, "mae_de_santo", input.players);
  if (mae?.action.targetId && players[mae.action.targetId]) {
    const t = players[mae.action.targetId];
    if (!t.alive && t.eliminated) {
      t.invoked = true;
      publicLog.push({
        round: input.round,
        type: "invocation",
        message: `Uma presença retorna por mais um dia. ${t.name} tem algo a dizer.`,
        timestamp: input.now,
      });
    }
  }

  const cart = getAction(input.nightActions, "cartomante", input.players);
  if (cart?.action.targetId && players[cart.action.targetId]) {
    const t = players[cart.action.targetId];
    let label = alignmentLabel(ROLE_SIDE[t.role]);
    if (t.role === "curupira") label = invertAlignment(label);
    pushPrivate(cart.playerId, `Sua investigação: ${t.name} é ${label}.`);
  }

  const boi = getAction(input.nightActions, "boitata", input.players);
  if (boi?.action.targetId && players[boi.action.targetId]) {
    const t = players[boi.action.targetId];
    let label = alignmentLabel(ROLE_SIDE[t.role]);
    if (t.role === "curupira") label = invertAlignment(label);
    pushPrivate(boi.playerId, `Sua investigação: ${t.name} é ${label}.`);
  }

  const del = getAction(input.nightActions, "delegado", input.players);
  if (del?.action.targetId && players[del.action.targetId]) {
    const t = players[del.action.targetId];
    t.jailed = true;
    const reason = del.action.specialAction?.trim();
    const msg = reason
      ? `O Delegado ordenou a prisão de ${t.name}. Motivo: ${reason}.`
      : `O Delegado ordenou a prisão de ${t.name}.`;
    publicLog.push({ round: input.round, type: "special", message: msg, timestamp: input.now });
  }

  // Geni: converse = investigate; charm = already handled in protectedTargets above
  if (geniAction?.action.action === "converse" && geniAction.action.targetId && players[geniAction.action.targetId]) {
    const t = players[geniAction.action.targetId];
    const lab = isCreatureRole(t.role) ? "criatura" : "morador";
    pushPrivate(geniAction.playerId, `A conversa revela: ${t.name} é ${lab}.`);

    // Romance da Caatinga — só quando Geni usa Confiança (converse) no Cangaceiro; não gasta carga extra
    if (t.role === "cangaceiro") {
      const investigatedIds = input.geniInvestigatedIds[geniAction.playerId] ?? [];
      const parts: string[] = [];
      for (const pid of investigatedIds) {
        const inv = players[pid];
        if (!inv) continue;
        const nature = isCreatureRole(inv.role) ? "criatura" : "morador";
        parts.push(`${inv.name} (${nature})`);
      }
      const listText =
        parts.length > 0 ? parts.join(", ") : "ninguém ainda — esta foi a primeira conversa dela na cidade";
      pushPrivate(
        geniAction.action.targetId,
        `Geni passou a noite com você. Ela já sabe sobre: ${listText}.`,
      );
    }
  }

  const cang = getAction(input.nightActions, "cangaceiro", players);
  if (cang?.action.action === "query" && cang.action.targetId && players[cang.action.targetId]) {
    const t = players[cang.action.targetId];
    const geniPid = findPlayerIdByRole(players, "geni");
    const investigated =
      geniPid && (input.geniInvestigatedIds[geniPid] ?? []).includes(cang.action.targetId);
    if (investigated) {
      const lab = isCreatureRole(t.role) ? "criatura" : "morador";
      pushPrivate(cang.playerId, `Consulta: ${t.name} é ${lab}.`);
    } else if (geniPid) {
      players[geniPid].blockedNextNight = true;
    }
  }

  const visible = publicLog.filter((e) => e.type !== "dawn");
  if (visible.length === 0) {
    publicLog.push({
      round: input.round,
      type: "dawn",
      message: "A noite passou em silêncio. Mas o silêncio, aqui, nunca é inocente.",
      timestamp: input.now,
    });
  }

  let dawnSummary: DawnResolveResult["dawnSummary"] = "none";
  if (publicLog.some((e) => e.type === "death")) dawnSummary = "death";
  else if (publicLog.some((e) => e.type === "bite")) dawnSummary = "bite";
  else if (publicLog.some((e) => e.type === "terror")) dawnSummary = "terror";
  else if (publicLog.some((e) => e.type === "invocation")) dawnSummary = "invocation";

  if (doc?.action.targetId) {
    const d = players[doc.playerId];
    if (d) d.doctorLastTargetId = doc.action.targetId;
  }

  return { players, publicLog, privateLog, individualWins, dawnSummary };
}
