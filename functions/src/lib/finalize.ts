import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { GeniInvestigationRecord, NightActionInput, PlayerDawnState, WinPlayerSnapshot } from "folclore-game-engine";
import {
  resolveDawn,
  DAY_OPENING,
  DAY_PRIMER_ENCHANTED,
  DAY_PRIMER_SEDUCED,
  tallyExpulsionVotes,
  checkCollectiveWinDetailed,
  collectiveWinChronicleMessagePt,
  normalizeGeniInvestigatedTargets,
  isCreatureRole,
} from "folclore-game-engine";
import type { RoleId } from "folclore-game-engine";
import { db } from "./db.js";
import { loadPlayers, loadSecrets } from "../helpers.js";
import { finalizeMvpLedgerIfNeeded } from "./endGameScoring.js";
import { grantAldeaoObjectiveIfMoradoresWon, grantObjectiveMvp } from "./playerPrivateScore.js";
import { scoreBrasRoundTease, scoreMvpAtDawn, scoreMvpVotesAfterDay } from "./mvpDawnAndVoteScoring.js";
import { beginSaciGorroOffer, runPostExpulsionTail } from "./saciGorro.js";
import { buildBotContext, getBotSegmentsForDayOpen, normalizePhraseKey } from "./botChat/index.js";
import { mergeBotKnowledgeFromNightResolve } from "./botKnowledge/applyFromNightResolve.js";
import { analyzePriorRoundSemanticChat } from "./botKnowledge/analyzeChat.js";
import type { ChatSemanticIngestRow } from "./botKnowledge/analyzeChat.js";
import { appendVoteRound, parseBotKnowledge, promoteSuspects, pruneKnowledgeToLiving } from "./botKnowledge/merge.js";
import { selectVoteTarget } from "./botKnowledge/selectVoteTarget.js";
import type { BotKnowledgeSnapshot } from "./botKnowledge/types.js";
import {
  stringifyBotKnowledgeFirestore,
  mergeBotsVotedAgainstMeFromVoteDoc,
  pruneAllBotsKnowledge,
  bumpMistakeIfExpelledAllyBotPerspective,
  hydrateKnowledgeMapFromPlayerRows,
} from "./botKnowledge/dayMerge.js";
import { canBeExpulsionVoteTarget } from "./playerVote.js";

type LoadedPlayer = Awaited<ReturnType<typeof loadPlayers>>[number];
type SecretsMap = Awaited<ReturnType<typeof loadSecrets>>;
type NightKbSecrets = Record<
  string,
  { role: RoleId; side: import("folclore-game-engine").Side } | undefined
>;

const VOTES_DOC_META = new Set(["updatedAt", "botVoteReasons"]);

function dawnStateExpulsionEligible(st: PlayerDawnState): boolean {
  return canBeExpulsionVoteTarget({
    alive: st.alive,
    eliminated: st.eliminated,
    expelled: st.expelled,
    invoked: st.invoked,
  });
}

function buildWinPlayerSnapshots(players: LoadedPlayer[], secrets: SecretsMap): Record<string, WinPlayerSnapshot> {
  const winPlayers: Record<string, WinPlayerSnapshot> = {};
  for (const p of players) {
    const r = secrets[p.id]?.role;
    if (!r) continue;
    winPlayers[p.id] = {
      id: p.id,
      role: r,
      alive: p.alive !== false,
      eliminated: Boolean(p.eliminated),
      expelled: Boolean(p.expelled),
      individualObjectiveMet: Boolean(p.individualObjectiveMet),
      alignment: p.alignment === "moradores" || p.alignment === "criaturas" ? p.alignment : null,
    };
  }
  return winPlayers;
}

function appendUniqueString(arr: string[], id: string): string[] {
  if (arr.includes(id)) return arr;
  return [...arr, id];
}

function collectFiveTableNeutralEndWins(
  snaps: LoadedPlayer[],
  sec: SecretsMap,
  round: number,
  tablePlayerCount: number,
): Array<{ playerId: string; role: RoleId; type: string; round: number; timestamp: number }> {
  if (tablePlayerCount !== 5) return [];
  const out: Array<{ playerId: string; role: RoleId; type: string; round: number; timestamp: number }> = [];
  const ts = Date.now();
  for (const p of snaps) {
    const role = sec[p.id]?.role;
    if (role !== "curupira" && role !== "boitata") continue;
    const alive = p.alive !== false && !p.eliminated && !p.expelled;
    if (alive && p.individualObjectiveMet) {
      out.push({
        playerId: p.id,
        role,
        type: role === "curupira" ? "curupira_cinco_objetivo" : "boitata_cinco_objetivo",
        round,
        timestamp: ts,
      });
    }
  }
  return out;
}

function scheduleFiveTableNeutralObjectiveUpdates(
  roomCode: string,
  room: Record<string, unknown>,
  round: number,
  players: LoadedPlayer[],
  secrets: SecretsMap,
  nightActions: Record<string, NightActionInput | undefined>,
  resPlayers: Record<string, PlayerDawnState>,
): Promise<unknown>[] {
  const tasks: Promise<unknown>[] = [];
  const tableN = Number(room.gameTablePlayerCount ?? 0);
  if (tableN !== 5) return tasks;
  const moradorIds = (room.fiveTableMoradorIds as string[] | undefined) ?? [];
  if (moradorIds.length === 0) return tasks;

  const roomRef = db.collection("rooms").doc(roomCode);

  const curPid = players.find((p) => secrets[p.id]?.role === "curupira")?.id;
  if (curPid) {
    const st = resPlayers[curPid];
    if (st?.alive && !st.eliminated && !st.expelled) {
      const act = nightActions[curPid];
      if (act?.action === "protect" && act.targetId && moradorIds.includes(act.targetId)) {
        const curRow = players.find((p) => p.id === curPid)!;
        const prev = [...((curRow.curupiraFiveMoradoresProtected as string[]) ?? [])];
        const next = appendUniqueString(prev, act.targetId);
        const met = moradorIds.every((id) => next.includes(id));
        const wasMet = Boolean(curRow.individualObjectiveMet);
        tasks.push(
          roomRef.collection("players").doc(curPid).update({
            curupiraFiveMoradoresProtected: next,
            ...(met && !wasMet ? { individualObjectiveMet: true } : {}),
          }),
        );
        if (met && !wasMet) tasks.push(grantObjectiveMvp(roomCode, curPid, round));
      }
    }
  }

  const boiPid = players.find((p) => secrets[p.id]?.role === "boitata")?.id;
  if (boiPid) {
    const st = resPlayers[boiPid];
    if (st?.alive && !st.eliminated && !st.expelled) {
      const act = nightActions[boiPid];
      if (act?.action === "investigate" && act.targetId && moradorIds.includes(act.targetId)) {
        const boRow = players.find((p) => p.id === boiPid)!;
        const prev = [...((boRow.boitataFiveMoradoresInvestigated as string[]) ?? [])];
        const next = appendUniqueString(prev, act.targetId);
        const met = moradorIds.every((id) => next.includes(id));
        const wasMet = Boolean(boRow.individualObjectiveMet);
        tasks.push(
          roomRef.collection("players").doc(boiPid).update({
            boitataFiveMoradoresInvestigated: next,
            ...(met && !wasMet ? { individualObjectiveMet: true } : {}),
          }),
        );
        if (met && !wasMet) tasks.push(grantObjectiveMvp(roomCode, boiPid, round));
      }
    }
  }

  return tasks;
}

/** Se houver vencedor coletivo, encerra a sala e devolve true. */
export async function tryEndGameCollective(
  roomCode: string,
  round: number,
  roomData: Record<string, unknown>,
): Promise<boolean> {
  const roomRef = db.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  const rs = roomSnap.data() ?? {};
  if (rs.status === "ended") return false;

  const merged: Record<string, unknown> = { ...roomData, ...rs };
  const maxR = Number(merged.maxRounds ?? 7);
  const [snaps, sec] = await Promise.all([loadPlayers(roomCode), loadSecrets(roomCode)]);
  const winPlayers = buildWinPlayerSnapshots(snaps, sec);
  const tpc = Number(merged.gameTablePlayerCount ?? 0) || snaps.length;
  let checkRound = round;
  if (
    merged.debug === true &&
    (merged.debugForceMoonPhase as string | undefined) === "full"
  ) {
    checkRound = Math.max(round, maxR + 1);
  }
  const winDetail = checkCollectiveWinDetailed(winPlayers, checkRound, maxR, tpc);
  const w = winDetail.winner;
  if (!w) return false;

  const revealedRoles: Record<string, string> = {};
  for (const p of snaps) {
    const r = sec[p.id]?.role;
    if (r) revealedRoles[p.id] = r;
  }
  const endMsg = collectiveWinChronicleMessagePt(winDetail);
  const endBatch = db.batch();
  const extraWins = collectFiveTableNeutralEndWins(snaps, sec, round, tpc);
  const roomEndPatch: Record<string, unknown> = {
    status: "ended",
    phase: "ended",
    winner: w,
    votingOpen: false,
    revealedRoles,
    ...(winDetail.reason === "moradores_plaza_tie"
      ? { collectiveEndKind: "moradores_plaza_tie" }
      : { collectiveEndKind: FieldValue.delete() }),
  };
  if (extraWins.length > 0) {
    roomEndPatch.individualWins = FieldValue.arrayUnion(...extraWins);
  }
  endBatch.update(roomRef, roomEndPatch);
  if (endMsg) {
    endBatch.set(roomRef.collection("publicLogEntries").doc(), {
      round,
      type: "chronicle_end",
      message: endMsg,
      timestamp: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await endBatch.commit();
  if (w === "moradores") {
    await grantAldeaoObjectiveIfMoradoresWon(roomCode, round, w, snaps, sec).catch(console.error);
  }
  await finalizeMvpLedgerIfNeeded(roomCode).catch(console.error);
  return true;
}

export async function maybeFinalizeNight(roomCode: string, round: number): Promise<boolean> {
  const roomRef = db.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  const room = roomSnap.data() ?? {};
  if (room.status !== "night") return false;
  const pendingRoles = (room.nightPendingRoles as RoleId[]) ?? [];
  if (pendingRoles.length > 0) return false;

  const readyIds = new Set((room.nightReadyPlayerIds as string[] | undefined) ?? []);
  const players = await loadPlayers(roomCode);
  const aliveIds = players
    .filter((p) => p.alive !== false && !p.eliminated && !p.expelled)
    .map((p) => p.id);
  if (!aliveIds.every((id) => readyIds.has(id))) return false;

  await finalizeNight(roomCode, round);
  return true;
}

export async function finalizeNight(roomCode: string, round: number) {
  const roomRef = db.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  const room = roomSnap.data() ?? {};
  if (room.status !== "night") return;
  const geniHistory = normalizeGeniInvestigatedTargets(room.geniInvestigatedTargets);

  const [players, secrets, nightSnap] = await Promise.all([
    loadPlayers(roomCode),
    loadSecrets(roomCode),
    roomRef.collection("nightActions").doc(String(round)).get(),
  ]);
  const raw = nightSnap.data() ?? {};
  const nightActions: Record<string, NightActionInput | undefined> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "createdAt" || k === "updatedAt") continue;
    nightActions[k] = v as NightActionInput;
  }

  const geniPid = players.find((p) => secrets[p.id]?.role === "geni")?.id;
  const geniInvestigatedIds: Record<string, GeniInvestigationRecord[]> = {};
  if (geniPid) geniInvestigatedIds[geniPid] = [...geniHistory];

  const dawnPlayers: Record<string, PlayerDawnState> = {};
  for (const p of players) {
    const sec = secrets[p.id];
    if (!sec) continue;
    dawnPlayers[p.id] = {
      id: p.id,
      name: String(p.name ?? ""),
      role: sec.role,
      side: sec.side,
      alive: p.alive !== false,
      eliminated: Boolean(p.eliminated),
      expelled: Boolean(p.expelled),
      blockedNextNight: Boolean(p.blockedNextNight),
      nightAbilityBlockSource: p.nightAbilityBlockSource === "saci" ? "saci" : null,
      silenced: Boolean(p.silenced),
      silencedRounds: Number(p.silencedRounds ?? 0),
      enchanted: Boolean(p.enchanted),
      seduced: Boolean(p.seduced),
      jailed: Boolean(p.jailed),
      protected: Boolean(p.protected),
      invoked: Boolean(p.invoked),
      doctorLastTargetId: (p.doctorLastTargetId as string | null) ?? null,
      delegadoLastJailedId: (p.delegadoLastJailedId as string | null | undefined) ?? null,
      wolfBiteUsed: Boolean(p.wolfBiteUsed),
      mulaExorcizeUsed: Boolean(p.mulaExorcizeUsed),
      geniCharmUsed: Boolean(p.geniCharmUsed),
      catechized: Boolean(p.catechized),
      iaraSeductionBlockedThroughRound:
        p.iaraSeductionBlockedThroughRound == null ? null : Number(p.iaraSeductionBlockedThroughRound),
    };
  }

  const now = Date.now();
  const res = resolveDawn({
    round,
    now,
    players: dawnPlayers,
    nightActions,
    geniInvestigatedIds,
  });

  /* --- Bots: atualiza saber pela noite / chat anterior e já deposita votos no doc da rodada. --- */
  const botIdNight = new Set(players.filter((p) => Boolean(p.isBot)).map((p) => p.id));
  const kbByBotId = new Map<string, BotKnowledgeSnapshot>();
  for (const bid of botIdNight) {
    kbByBotId.set(bid, parseBotKnowledge(players.find((p) => p.id === bid)?.botKnowledge));
  }
  const playerRowsById = new Map<string, LoadedPlayer>();
  for (const p of players) playerRowsById.set(p.id, p);

  mergeBotKnowledgeFromNightResolve({
    round,
    dawnPlayersBefore: dawnPlayers,
    resPlayersAfter: res.players,
    nightActions,
    secrets: secrets as NightKbSecrets,
    playerRowsById: playerRowsById as Map<string, Record<string, unknown> & { id: string; alignment?: string }>,
    botIds: botIdNight,
    geniPid,
    geniInvestigatedIds,
    privateLogNew: res.privateLog,
    kbByBotId,
  });

  const livingNightIds = new Set(
    Object.entries(res.players)
      .filter(([, st]) => st.alive && !st.eliminated && !st.expelled)
      .map(([id]) => id),
  );
  const surviveBotsNight = new Set([...botIdNight].filter((id) => livingNightIds.has(id)));

  if (round > 1) {
    let chatRowsAnalyze: ChatSemanticIngestRow[] = [];
    try {
      const chatPri = await roomRef.collection("chat").orderBy("createdAt", "desc").limit(120).get();
      chatRowsAnalyze = chatPri.docs.map((d) => {
        const x = d.data() as Record<string, unknown>;
        const vrRaw = x.votesRound;
        const votesRoundParsed = typeof vrRaw === "number" ? vrRaw : Number(vrRaw ?? NaN);
        const sk = x.semanticKind;
        return {
          votesRound: Number.isFinite(votesRoundParsed) ? votesRoundParsed : undefined,
          semanticKind:
            sk === "accuse" || sk === "defend" || sk === "agree"
              ? sk
              : undefined,
          semanticTargetId:
            typeof x.semanticTargetId === "string" ? x.semanticTargetId : null,
        };
      });
    } catch {
      const chatPri = await roomRef.collection("chat").limit(120).get();
      chatRowsAnalyze = chatPri.docs.map((d) => {
        const x = d.data() as Record<string, unknown>;
        const vrRaw = x.votesRound;
        const votesRoundParsed = typeof vrRaw === "number" ? vrRaw : Number(vrRaw ?? NaN);
        const sk = x.semanticKind;
        return {
          votesRound: Number.isFinite(votesRoundParsed) ? votesRoundParsed : undefined,
          semanticKind:
            sk === "accuse" || sk === "defend" || sk === "agree"
              ? sk
              : undefined,
          semanticTargetId:
            typeof x.semanticTargetId === "string" ? x.semanticTargetId : null,
        };
      });
    }
    analyzePriorRoundSemanticChat(round - 1, chatRowsAnalyze, kbByBotId, surviveBotsNight);
  }

  for (const bid of botIdNight) {
    const k0 = kbByBotId.get(bid);
    if (!k0 || !livingNightIds.has(bid)) continue;
    const nextK = pruneKnowledgeToLiving(livingNightIds, k0);
    promoteSuspects(nextK);
    kbByBotId.set(bid, nextK);
  }

  const rngVN = Math.random;
  const aliveLivNight = Object.entries(res.players)
    .map(([id, state]) => ({ id, state }))
    .filter(({ state }) => state.alive && !state.eliminated && !state.expelled);
  const humanNightCt = aliveLivNight.filter(({ id }) => !botIdNight.has(id)).length;
  const debugVoteMapNight = (room.debugBotVoteTargets as Record<string, string> | undefined) ?? {};
  const botDbgReasonNight: Record<string, string> = {};
  const botVotesForBatch: Record<string, string | null> = {};

  for (const { id: voterId, state: vst } of aliveLivNight) {
    if (!botIdNight.has(voterId) || vst.seduced || vst.jailed) continue;
    const kb = kbByBotId.get(voterId);
    if (!kb || !livingNightIds.has(voterId)) continue;
    const roleV = secrets[voterId]?.role;
    if (!roleV) continue;
    const prowV = players.find((pl) => pl.id === voterId);
    const alignV =
      prowV?.alignment === "moradores" || prowV?.alignment === "criaturas"
        ? prowV.alignment
        : undefined;
    const voterEnchantedNight = Boolean(vst.enchanted);

    const canVotePidNight = (targetId: string, tst: PlayerDawnState) => {
      if (!dawnStateExpulsionEligible(tst)) return false;
      const tr = secrets[targetId]?.role;
      if (voterEnchantedNight && tr && isCreatureRole(tr)) return false;
      return true;
    };

    const lawfulIdsNight = aliveLivNight
      .filter(({ id }) => id !== voterId)
      .filter(({ id, state }) => canVotePidNight(id, state))
      .map((x) => x.id);

    if (humanNightCt === 0) {
      appendVoteRound(kb, round, null, "random");
      botVotesForBatch[voterId] = null;
      continue;
    }

    const forcedTargetDbg = room.debug === true ? debugVoteMapNight[voterId] : undefined;
    const forcedOkDbg = Boolean(forcedTargetDbg && lawfulIdsNight.includes(forcedTargetDbg));
    if (forcedOkDbg) {
      appendVoteRound(kb, round, forcedTargetDbg!, "confirmed");
      botVotesForBatch[voterId] = forcedTargetDbg!;
      if (room.debug === true) botDbgReasonNight[voterId] = "confirmed";
      continue;
    }

    if (roleV === "bras_cubas" && rngVN() < 0.3) {
      const humanLawful = lawfulIdsNight.filter((id) => !botIdNight.has(id));
      let tbras: string | null = null;
      if (humanLawful.length > 0 && rngVN() < 0.5) {
        tbras = humanLawful[Math.floor(rngVN() * humanLawful.length)]!;
      } else if (lawfulIdsNight.length > 0) {
        tbras = lawfulIdsNight[Math.floor(rngVN() * lawfulIdsNight.length)]!;
      }
      appendVoteRound(kb, round, tbras, "bras_troll");
      botVotesForBatch[voterId] = tbras;
      if (room.debug === true) botDbgReasonNight[voterId] = "bras_troll";
      continue;
    }

    const pickedNv = selectVoteTarget({
      rng: rngVN,
      voterId,
      kb,
      voterRole: roleV,
      voterAlign: alignV,
      aliveEntries: aliveLivNight,
      canTarget: (tid, tst) => tid !== voterId && canVotePidNight(tid, tst),
      saciChaos: roleV === "saci",
    });
    appendVoteRound(kb, round, pickedNv.targetId, pickedNv.reason);
    botVotesForBatch[voterId] = pickedNv.targetId;
    if (room.debug === true) botDbgReasonNight[voterId] = pickedNv.reason;
  }

  const votesNightPatch: Record<string, unknown> = {
    ...botVotesForBatch,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (room.debug === true && Object.keys(botDbgReasonNight).length > 0) {
    votesNightPatch.botVoteReasons = botDbgReasonNight;
  }

  const batch = db.batch();
  for (const [pid, pl] of Object.entries(res.players)) {
    const ref = roomRef.collection("players").doc(pid);
    const upd: Record<string, unknown> = {
      alive: pl.alive,
      eliminated: pl.eliminated,
      expelled: pl.expelled,
      blockedNextNight: pl.blockedNextNight,
      nightAbilityBlockSource: pl.nightAbilityBlockSource ?? null,
      silenced: pl.silenced,
      silencedRounds: pl.silencedRounds,
      enchanted: pl.enchanted,
      seduced: pl.seduced,
      jailed: pl.jailed,
      invoked: pl.invoked,
      doctorLastTargetId: pl.doctorLastTargetId ?? null,
    };
    if (pl.role === "delegado") {
      upd.delegadoLastJailedId = pl.delegadoLastJailedId ?? null;
    }
    if (pl.silenced) upd.silencedUntil = Timestamp.fromMillis(now + 120_000);
    else upd.silencedUntil = FieldValue.delete();
    if (pl.iaraSeductionBlockedThroughRound != null) {
      upd.iaraSeductionBlockedThroughRound = pl.iaraSeductionBlockedThroughRound;
    } else {
      upd.iaraSeductionBlockedThroughRound = FieldValue.delete();
    }
    const prowNight = players.find((p) => p.id === pid);
    if (prowNight?.isBot) {
      const bk = kbByBotId.get(pid);
      if (bk) upd.botKnowledge = stringifyBotKnowledgeFirestore(bk);
    }
    batch.update(ref, upd);
  }

  for (const e of res.publicLog) {
    const ref = roomRef.collection("publicLogEntries").doc();
    batch.set(ref, { ...e, createdAt: FieldValue.serverTimestamp() });
  }

  for (const [pid, entries] of Object.entries(res.privateLog)) {
    for (const e of entries) {
      const ref = roomRef.collection("privateLog").doc(pid).collection("entries").doc();
      batch.set(ref, { ...e, createdAt: FieldValue.serverTimestamp() });
    }
  }

  for (const pid of Object.keys(res.players)) {
    const before = dawnPlayers[pid];
    const after = res.players[pid];
    if (!before || !after || after.alive === false || after.eliminated || after.expelled) continue;
    if (!before.enchanted && after.enchanted) {
      const ref = roomRef.collection("privateLog").doc(pid).collection("entries").doc();
      batch.set(ref, {
        round,
        message: DAY_PRIMER_ENCHANTED,
        timestamp: now,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    if (!before.seduced && after.seduced) {
      const ref = roomRef.collection("privateLog").doc(pid).collection("entries").doc();
      batch.set(ref, {
        round,
        message: DAY_PRIMER_SEDUCED,
        timestamp: now,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }

  const wins = [...((room.individualWins as unknown[]) ?? []), ...res.individualWins];

  let saciActed = false;
  for (const [pid, a] of Object.entries(nightActions)) {
    if (a?.role === "saci" && secrets[pid]?.role === "saci") {
      saciActed = true;
      break;
    }
  }

  const botoId = players.find((p) => secrets[p.id]?.role === "boto")?.id;
  let botoEnchantedMoradores: string[] = (room.botoEnchantedMoradores as string[] | undefined) ?? [];
  if (botoId) {
    const botoAction = Object.entries(nightActions).find(([pid]) => secrets[pid]?.role === "boto")?.[1];
    if (botoAction?.targetId && res.players[botoAction.targetId]?.enchanted) {
      const targetSec = secrets[botoAction.targetId];
      if (targetSec?.side === "morador" && !botoEnchantedMoradores.includes(botoAction.targetId)) {
        botoEnchantedMoradores = [...botoEnchantedMoradores, botoAction.targetId];
      }
    }
  }

  const padreId = players.find((p) => secrets[p.id]?.role === "padre")?.id;
  let padreCatechizedMoradores: string[] = (room.padreCatechizedMoradores as string[] | undefined) ?? [];
  if (padreId) {
    const padreAction = Object.entries(nightActions).find(([pid]) => secrets[pid]?.role === "padre")?.[1];
    if (padreAction?.targetId && res.players[padreAction.targetId]?.catechized) {
      const targetSec = secrets[padreAction.targetId];
      if (targetSec?.side === "morador" && !padreCatechizedMoradores.includes(padreAction.targetId)) {
        padreCatechizedMoradores = [...padreCatechizedMoradores, padreAction.targetId];
      }
    }
  }

  batch.update(roomRef, {
    status: "day",
    phase: "day",
    currentActorRole: null,
    nightPhaseIndex: 0,
    nightOrderRoles: [],
    nightPendingRoles: [],
    votingOpen: true,
    votesRound: round,
    saciActedLastNight: saciActed,
    individualWins: wins,
    botoEnchantedMoradores,
    padreCatechizedMoradores,
  });

  const openRef = roomRef.collection("publicLogEntries").doc();
  batch.set(openRef, {
    round,
    type: "dawn",
    message: DAY_OPENING,
    timestamp: now,
    createdAt: FieldValue.serverTimestamp(),
  });

  if (Object.keys(botVotesForBatch).length > 0) {
    batch.set(roomRef.collection("votes").doc(String(round)), votesNightPatch, { merge: true });
  }

  await batch.commit();

  const blockedActorIds = new Set(players.filter((p) => Boolean(p.blockedNextNight)).map((p) => p.id));
  await scoreMvpAtDawn(roomCode, round, players, secrets, nightActions, blockedActorIds).catch(console.error);

  const postObjectiveUpdates: Promise<unknown>[] = [];

  if (botoId) {
    const aliveMoradores = players.filter(
      (p) => secrets[p.id]?.side === "morador" && res.players[p.id]?.alive && !res.players[p.id]?.eliminated && !res.players[p.id]?.expelled,
    );
    if (aliveMoradores.length > 0 && aliveMoradores.every((p) => botoEnchantedMoradores.includes(p.id))) {
      const botoPlayer = players.find((p) => p.id === botoId)!;
      if (!botoPlayer.individualObjectiveMet) {
        const newWin = { playerId: botoId, role: "boto", type: "boto_all_moradores", round, timestamp: Date.now() };
        postObjectiveUpdates.push(
          roomRef.collection("players").doc(botoId).update({ individualObjectiveMet: true }),
          roomRef.update({ individualWins: FieldValue.arrayUnion(newWin) }),
          grantObjectiveMvp(roomCode, botoId, round),
        );
      }
    }
  }

  if (padreId) {
    const aliveMoradores = players.filter(
      (p) => secrets[p.id]?.side === "morador" && res.players[p.id]?.alive && !res.players[p.id]?.eliminated && !res.players[p.id]?.expelled,
    );
    if (aliveMoradores.length > 0 && aliveMoradores.every((p) => padreCatechizedMoradores.includes(p.id))) {
      const padrePlayer = players.find((p) => p.id === padreId)!;
      if (!padrePlayer.individualObjectiveMet) {
        const newWin = { playerId: padreId, role: "padre", type: "padre_all_moradores", round, timestamp: Date.now() };
        postObjectiveUpdates.push(
          roomRef.collection("players").doc(padreId).update({ individualObjectiveMet: true }),
          roomRef.update({ individualWins: FieldValue.arrayUnion(newWin) }),
          grantObjectiveMvp(roomCode, padreId, round),
        );
      }
    }
  }

  for (const win of res.individualWins) {
    if (win.type !== "iara_delegado" && win.type !== "mula_padre") continue;
    const winPlayer = players.find((p) => p.id === win.playerId);
    if (winPlayer && !winPlayer.individualObjectiveMet) {
      postObjectiveUpdates.push(
        roomRef.collection("players").doc(win.playerId).update({ individualObjectiveMet: true }),
        grantObjectiveMvp(roomCode, win.playerId, round),
      );
    }
  }

  postObjectiveUpdates.push(
    ...scheduleFiveTableNeutralObjectiveUpdates(
      roomCode,
      room,
      round,
      players,
      secrets,
      nightActions,
      res.players,
    ),
  );

  await Promise.all(postObjectiveUpdates);

  if (await tryEndGameCollective(roomCode, round, room)) {
    return;
  }

  const botIds = new Set(players.filter((p) => Boolean(p.isBot)).map((p) => p.id));

  const botPlayers = Object.values(res.players).filter(
    (p) => p.alive && !p.eliminated && !p.expelled && !p.silenced && botIds.has(p.id),
  );
  if (botPlayers.length > 0) {
    const rng = Math.random;
    const livingRefs = players
      .filter((pl) => {
        const st = res.players[pl.id];
        return Boolean(st?.alive && !st.eliminated && !st.expelled);
      })
      .map((pl) => ({
        id: pl.id,
        name: String(pl.name ?? pl.id),
        side: (secrets[pl.id]?.side ?? "morador") as "criatura" | "morador" | "neutro",
        isBot: Boolean(pl.isBot),
      }));

    let chatHistory: Array<{
      playerId: string;
      name: string;
      text: string;
      type?: string;
      votesRound?: number;
      semanticKind?: "accuse" | "defend" | "agree";
      semanticTargetId?: string | null;
    }> = [];
    try {
      const chatSnap = await roomRef.collection("chat").orderBy("createdAt", "desc").limit(40).get();
      chatHistory = chatSnap.docs
        .map((d) => {
          const x = d.data() as Record<string, unknown>;
          const sk = x.semanticKind;
          const semanticKindParsed =
            sk === "accuse" || sk === "defend" || sk === "agree"
              ? (sk as "accuse" | "defend" | "agree")
              : undefined;
          const vrRaw = x.votesRound;
          const votesRoundN = typeof vrRaw === "number" ? vrRaw : Number(vrRaw ?? NaN);
          return {
            playerId: String(x.playerId ?? ""),
            name: String(x.name ?? ""),
            text: String(x.text ?? ""),
            type: x.type as string | undefined,
            votesRound: Number.isFinite(votesRoundN) ? votesRoundN : undefined,
            semanticKind: semanticKindParsed,
            semanticTargetId:
              typeof x.semanticTargetId === "string" ? x.semanticTargetId : null,
          };
        })
        .reverse();
    } catch {
      const chatSnap = await roomRef.collection("chat").limit(40).get();
      chatHistory = chatSnap.docs.map((d) => {
        const x = d.data() as Record<string, unknown>;
        const sk = x.semanticKind;
        const semanticKindParsed =
          sk === "accuse" || sk === "defend" || sk === "agree"
            ? (sk as "accuse" | "defend" | "agree")
            : undefined;
        const vrRaw = x.votesRound;
        const votesRoundN = typeof vrRaw === "number" ? vrRaw : Number(vrRaw ?? NaN);
        return {
          playerId: String(x.playerId ?? ""),
          name: String(x.name ?? ""),
          text: String(x.text ?? ""),
          type: x.type as string | undefined,
          votesRound: Number.isFinite(votesRoundN) ? votesRoundN : undefined,
          semanticKind: semanticKindParsed,
          semanticTargetId:
            typeof x.semanticTargetId === "string" ? x.semanticTargetId : null,
        };
      });
    }

    const publicLogThisDawn = res.publicLog.map((e) => ({
      type: e.type,
      message: e.message,
    }));
    const botoPlayerId = players.find((pl) => secrets[pl.id]?.role === "boto")?.id ?? null;
    const iaraPlayerId = players.find((pl) => secrets[pl.id]?.role === "iara")?.id ?? null;
    const padrePlayerId = players.find((pl) => secrets[pl.id]?.role === "padre")?.id ?? null;

    const shuffledBots = [...botPlayers].sort(() => rng() - 0.5);
    const phrasesUsedThisDay = new Set<string>();
    for (const chatBot of shuffledBots) {
      const role = secrets[chatBot.id]?.role ?? "aldeao";
      const prowChat = players.find((pl) => pl.id === chatBot.id);
      const ctxBase = buildBotContext({
        selfPlayerId: chatBot.id,
        role,
        roundNumber: round,
        messageIndex: 0,
        votesRoundDay: round,
        livingPlayers: livingRefs,
        chatHistory,
        publicLogThisDawn,
        botoPlayerId,
        iaraPlayerId,
        padrePlayerId,
        rng,
        neutralAlignment:
          prowChat?.alignment === "moradores" || prowChat?.alignment === "criaturas"
            ? prowChat.alignment
            : null,
        botKnowledge: kbByBotId.get(chatBot.id),
      });
      const segmentsDn = getBotSegmentsForDayOpen(ctxBase, rng, {
        avoidPhrases: phrasesUsedThisDay,
      });
      for (const seg of segmentsDn) {
        phrasesUsedThisDay.add(normalizePhraseKey(seg.text));
        const chatPayload: Record<string, unknown> = {
          playerId: chatBot.id,
          name: chatBot.name,
          text: seg.text,
          votesRound: round,
          createdAt: FieldValue.serverTimestamp(),
        };
        if (seg.semanticKind) chatPayload.semanticKind = seg.semanticKind;
        if (seg.semanticTargetId) chatPayload.semanticTargetId = seg.semanticTargetId;
        await roomRef.collection("chat").add(chatPayload);
        chatHistory = [
          ...chatHistory,
          {
            playerId: chatBot.id,
            name: chatBot.name,
            text: seg.text,
            votesRound: round,
            semanticKind: seg.semanticKind,
            semanticTargetId: seg.semanticTargetId ?? null,
          },
        ];
      }
    }
  }
  if (Object.keys(botVotesForBatch).length > 0) {
    const nameByIdChat = new Map(players.map((pl) => [pl.id, String(pl.name ?? pl.id)]));
    const voteAnnounceBatch = db.batch();
    for (const voterId of Object.keys(botVotesForBatch)) {
      const voterName = nameByIdChat.get(voterId) ?? voterId;
      const crefDn = roomRef.collection("chat").doc();
      voteAnnounceBatch.set(crefDn, {
        playerId: voterId,
        name: voterName,
        text: "votou.",
        type: "vote",
        votesRound: round,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    await voteAnnounceBatch.commit();
  }

  const aliveAfterDawn = Object.values(res.players).filter((p) => p.alive && !p.eliminated && !p.expelled);
  const aliveHumansAfterDawn = aliveAfterDawn.filter((p) => !players.find((pl) => pl.id === p.id)?.isBot);
  if (aliveHumansAfterDawn.length === 0) {
    await finalizeDay(roomCode, round);
  }
}

export async function finalizeDay(roomCode: string, round: number) {
  const roomRef = db.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  const room = roomSnap.data() ?? {};
  if (room.status !== "day" || room.votingOpen === false) return;

  const [players, secrets, voteSnap] = await Promise.all([
    loadPlayers(roomCode),
    loadSecrets(roomCode),
    roomRef.collection("votes").doc(String(round)).get(),
  ]);

  const aliveHumansCheck = players.filter(
    (p) => !p.isBot && p.alive !== false && !p.eliminated && !p.expelled,
  );
  if (aliveHumansCheck.length === 0) {
    const wpCheck: Record<string, WinPlayerSnapshot> = {};
    for (const p of players) {
      const r = secrets[p.id]?.role;
      if (!r) continue;
      wpCheck[p.id] = {
        id: p.id,
        role: r,
        alive: p.alive !== false,
        eliminated: Boolean(p.eliminated),
        expelled: Boolean(p.expelled),
        individualObjectiveMet: Boolean(p.individualObjectiveMet),
        alignment:
          p.alignment === "moradores" || p.alignment === "criaturas" ? p.alignment : null,
      };
    }
    const maxR = Number(room.maxRounds ?? 7);
    const tpc = Number(room.gameTablePlayerCount ?? 0) || players.length;
    const detail = checkCollectiveWinDetailed(wpCheck, round, maxR, tpc);
    const forcedWinner = detail.winner ?? "bots";
    const revealedRolesCheck: Record<string, string> = {};
    for (const p of players) {
      const r = secrets[p.id]?.role;
      if (r) revealedRolesCheck[p.id] = r;
    }
    const endBatch = db.batch();
    endBatch.update(roomRef, {
      status: "ended",
      phase: "ended",
      winner: forcedWinner,
      votingOpen: false,
      revealedRoles: revealedRolesCheck,
      ...(detail.reason === "moradores_plaza_tie"
        ? { collectiveEndKind: "moradores_plaza_tie" }
        : { collectiveEndKind: FieldValue.delete() }),
    });
    const endMsg =
      forcedWinner === "bots"
        ? "As criaturas fugiram. Os moradores sumiram. Algo que não veio do rio, do mato ou do sertão desceu sobre Bucaré sem avisar. Não tinha gorro vermelho. Não tinha escama. Não tinha maldição. Tinha circuito. Os robôs tomaram a praça, abduzindo tudo que era carne, folclore ou mistério — e a Bucaré ficou olhando, sem saber o que fazer com raízes que nunca viram isso antes. O cordel não tem estrofe pra apocalipse robô."
        : collectiveWinChronicleMessagePt(detail);
    if (endMsg) {
      endBatch.set(roomRef.collection("publicLogEntries").doc(), {
        round,
        type: "chronicle_end",
        message: endMsg,
        timestamp: Date.now(),
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    await endBatch.commit();
    if (forcedWinner === "moradores") {
      await grantAldeaoObjectiveIfMoradoresWon(roomCode, round, forcedWinner, players, secrets).catch(console.error);
    }
    await finalizeMvpLedgerIfNeeded(roomCode).catch(console.error);
    return;
  }

  const voteRound = Number(room.votesRound ?? room.round ?? 1);
  if (Number(room.voidedDayExpulsionRound) === voteRound) {
    const voidBatch = db.batch();
    voidBatch.update(roomRef, { votingOpen: false });
    voidBatch.set(roomRef.collection("publicLogEntries").doc(), {
      round: voteRound,
      type: "expulsion",
      message:
        "A praça até discutiu — mas os votos deste dia não valem: a acusação formal do Coronel já tinha decidido o rumo da cidade.",
      timestamp: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    });
    await voidBatch.commit();
    if (await tryEndGameCollective(roomCode, voteRound, room)) {
      return;
    }
    const roomAfterVoid = (await roomRef.get()).data() ?? {};
    const gorroPending =
      roomAfterVoid.pendingSaciGorro != null &&
      typeof roomAfterVoid.pendingSaciGorro === "object" &&
      "saciPlayerId" in (roomAfterVoid.pendingSaciGorro as object);
    if (!roomAfterVoid.pendingBrasChoice && !gorroPending) {
      const nextRound = voteRound + 1;
      await roomRef.update({ pendingNightStart: true, pendingNightRound: nextRound });
    }
    return;
  }

  const votesRaw = voteSnap.data() ?? {};
  const votes = Object.entries(votesRaw)
    .filter(([k]) => !VOTES_DOC_META.has(k))
    .map(([voterId, targetId]) => ({ voterId, targetId: (targetId as string) || null }));

  const voteRecord: Record<string, string | null | undefined> = {};
  for (const [k, v] of Object.entries(votesRaw)) {
    if (VOTES_DOC_META.has(k)) continue;
    voteRecord[k] = v == null || v === "" ? null : String(v);
  }

  const roleByPlayerId: Record<string, RoleId> = {};
  for (const p of players) {
    const s = secrets[p.id];
    if (s) roleByPlayerId[p.id] = s.role;
  }

  const brasId = players.find((p) => secrets[p.id]?.role === "bras_cubas")?.id ?? null;
  const tally = tallyExpulsionVotes(votes, {
    doubleVotesOnBras: Boolean(room.saciActedLastNight),
    brasPlayerId: brasId,
    enchantedVoterIds: new Set(players.filter((p) => p.enchanted).map((p) => p.id)),
    roleByPlayerId,
  });

  if (tally.expelledId) {
    const tallyRole = secrets[tally.expelledId]?.role;
    const tallyPlayer = players.find((p) => p.id === tally.expelledId);
    if (tallyRole === "saci" && tallyPlayer && !tallyPlayer.actionUsed) {
      await beginSaciGorroOffer(roomCode, round, tally.expelledId, players);
      return;
    }
  }

  const botIdSetFinalize = new Set(players.filter((p) => Boolean(p.isBot)).map((p) => p.id));
  const kbAfterDay = hydrateKnowledgeMapFromPlayerRows({
    players,
    botIds: botIdSetFinalize,
  });
  mergeBotsVotedAgainstMeFromVoteDoc(voteRecord, kbAfterDay, botIdSetFinalize);

  const livingAfterDay = new Set(
    players.filter((p) => p.alive !== false && !p.eliminated && !p.expelled).map((p) => p.id),
  );
  const expelledEarly = tally.expelledId ?? null;
  if (expelledEarly) livingAfterDay.delete(expelledEarly);
  pruneAllBotsKnowledge(
    livingAfterDay,
    kbAfterDay,
    new Set([...botIdSetFinalize].filter((id) => livingAfterDay.has(id))),
  );

  if (expelledEarly) {
    const expRole = secrets[expelledEarly]?.role;
    const xp = players.find((p) => p.id === expelledEarly);
    if (expRole && xp) {
      const botsMeta = new Map<
        string,
        { role: RoleId; alignment?: "moradores" | "criaturas" | null }
      >();
      for (const bid of botIdSetFinalize) {
        const meta = secrets[bid];
        const prow = players.find((p) => p.id === bid);
        if (!meta) continue;
        botsMeta.set(bid, {
          role: meta.role,
          alignment:
            prow?.alignment === "moradores" || prow?.alignment === "criaturas"
              ? prow.alignment
              : null,
        });
      }
      bumpMistakeIfExpelledAllyBotPerspective({
        expelledId: expelledEarly,
        expelledRole: expRole,
        expelledAlign:
          xp.alignment === "moradores" || xp.alignment === "criaturas" ? xp.alignment : null,
        kbByBotId: kbAfterDay,
        survivingBotIds: new Set([...botIdSetFinalize].filter((id) => livingAfterDay.has(id))),
        botsMeta,
        voteRound,
      });
    }
  }

  const batch = db.batch();
  if (tally.expelledId) {
    const expelled = players.find((p) => p.id === tally.expelledId)!;
    const role = secrets[tally.expelledId]!.role;
    batch.update(roomRef.collection("players").doc(tally.expelledId), { alive: false, expelled: true });
    const msg =
      role === "bras_cubas"
        ? `Espera. ${expelled.name} sorri. Era o Tolo — e ser expulso era exatamente o que queria.`
        : `A cidade votou pela expulsão de: ${expelled.name}.`;
    batch.set(roomRef.collection("publicLogEntries").doc(), {
      round,
      type: role === "bras_cubas" ? "special" : "expulsion",
      message: msg,
      timestamp: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    });
    const roomBatchUpdate: Record<string, unknown> = {
      votingOpen: false,
      ...(role === "bras_cubas" ? { pendingBrasChoice: true } : {}),
    };
    if (role === "padre") {
      const mulaPlayer = players.find((p) => secrets[p.id]?.role === "mula");
      if (mulaPlayer && !mulaPlayer.individualObjectiveMet) {
        batch.update(roomRef.collection("players").doc(mulaPlayer.id), { individualObjectiveMet: true });
        const mulaWin = { playerId: mulaPlayer.id, role: "mula", type: "mula_padre", round, timestamp: Date.now() };
        roomBatchUpdate.individualWins = FieldValue.arrayUnion(mulaWin);
      }
    }
    batch.update(roomRef, roomBatchUpdate);
  } else {
    batch.update(roomRef, { votingOpen: false });
    batch.set(roomRef.collection("publicLogEntries").doc(), {
      round,
      type: "expulsion",
      message: "A votação terminou em empate. Ninguém foi expulso.",
      timestamp: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  for (const bid of botIdSetFinalize) {
    if (!livingAfterDay.has(bid)) continue;
    const kbRow = kbAfterDay.get(bid);
    if (!kbRow) continue;
    batch.update(roomRef.collection("players").doc(bid), {
      botKnowledge: stringifyBotKnowledgeFirestore(kbRow),
    });
  }

  await batch.commit();

  if (tally.expelledId) {
    await runPostExpulsionTail(roomCode, round, tally.expelledId, voteRecord, brasId);
  } else {
    if (await tryEndGameCollective(roomCode, round, room)) {
      return;
    }
    const nextRound = round + 1;
    await roomRef.update({ pendingNightStart: true, pendingNightRound: nextRound });
  }
}
