import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { NightActionInput, PlayerDawnState, WinPlayerSnapshot } from "folclore-game-engine";
import {
  resolveDawn,
  DAY_OPENING,
  tallyExpulsionVotes,
  checkCollectiveWinDetailed,
  collectiveWinChronicleMessagePt,
} from "folclore-game-engine";
import type { RoleId } from "folclore-game-engine";
import { db } from "./db.js";
import { loadPlayers, loadSecrets } from "../helpers.js";
import { finalizeMvpLedgerIfNeeded } from "./endGameScoring.js";
import { grantAldeaoObjectiveIfMoradoresWon, grantObjectiveMvp } from "./playerPrivateScore.js";
import { scoreBrasRoundTease, scoreMvpAtDawn, scoreMvpVotesAfterDay } from "./mvpDawnAndVoteScoring.js";
import { beginSaciGorroOffer, runPostExpulsionTail } from "./saciGorro.js";

type LoadedPlayer = Awaited<ReturnType<typeof loadPlayers>>[number];
type SecretsMap = Awaited<ReturnType<typeof loadSecrets>>;

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
  const maxR = Number(roomData.maxRounds ?? 7);
  const [snaps, sec] = await Promise.all([loadPlayers(roomCode), loadSecrets(roomCode)]);
  const winPlayers = buildWinPlayerSnapshots(snaps, sec);
  const tpc = Number(roomData.gameTablePlayerCount ?? 0) || snaps.length;
  let checkRound = round;
  if (
    roomData.debug === true &&
    (roomData.debugForceMoonPhase as string | undefined) === "full"
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
  const geniHistory = (room.geniInvestigatedTargets as string[] | undefined) ?? [];

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
  const geniInvestigatedIds: Record<string, string[]> = {};
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
      nightAbilityBlockSource:
        p.nightAbilityBlockSource === "cangaceiro"
          ? "cangaceiro"
          : p.nightAbilityBlockSource === "saci"
            ? "saci"
            : null,
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

  const BOT_PHRASES = [
    "Não dormiu bem essa noite não, não…",
    "Tem coisa estranha acontecendo por aqui.",
    "Eu não sei de nada, mas suspeito de tudo.",
    "Essa noite tava silenciosa demais pra ser inocente.",
    "Alguém aqui sabe mais do que tá mostrando.",
    "Vou ficar de olho em todo mundo hoje.",
    "Se ficar quieto parece suspeito. Se falar parece suspeito. Que dilema.",
    "O sertão não perdoa quem acredita demais.",
    "Cuidado com quem sorri muito de manhã.",
    "Mais uma noite que passou. Será que vai ter mais uma?",
  ];
  const botPlayers = Object.values(res.players).filter(
    (p) => p.alive && !p.eliminated && !p.expelled && !p.silenced && botIds.has(p.id),
  );
  if (botPlayers.length > 0) {
    const chatBot = botPlayers[Math.floor(Math.random() * botPlayers.length)];
    const phrase = BOT_PHRASES[Math.floor(Math.random() * BOT_PHRASES.length)];
    await roomRef.collection("chat").add({
      playerId: chatBot.id,
      name: chatBot.name,
      text: phrase,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  if (botIds.size > 0) {
    const aliveNow = Object.values(res.players).filter((p) => p.alive && !p.eliminated && !p.expelled);
    const aliveHumans = aliveNow.filter((p) => !botIds.has(p.id));
    const botVotes: Record<string, string | null> = {};
    const debugVoteMap = (room.debugBotVoteTargets as Record<string, string> | undefined) ?? {};
    for (const p of aliveNow) {
      if (!botIds.has(p.id) || p.seduced || p.jailed) continue;
      const targets = aliveHumans.length > 0 ? aliveNow.filter((t) => t.id !== p.id) : [];
      const forcedTarget = debugVoteMap[p.id];
      const forceOk =
        room.debug === true && forcedTarget && targets.some((t) => t.id === forcedTarget);
      botVotes[p.id] =
        targets.length === 0
          ? null
          : forceOk
            ? forcedTarget!
            : targets[Math.floor(Math.random() * targets.length)].id;
    }
    if (Object.keys(botVotes).length > 0) {
      await roomRef.collection("votes").doc(String(round)).set(
        { ...botVotes, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      const nameById = new Map(players.map((pl) => [pl.id, String(pl.name ?? pl.id)]));
      const voteChatBatch = db.batch();
      for (const voterId of Object.keys(botVotes)) {
        const voterName = nameById.get(voterId) ?? voterId;
        const cref = roomRef.collection("chat").doc();
        voteChatBatch.set(cref, {
          playerId: voterId,
          name: voterName,
          text: "votou.",
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      await voteChatBatch.commit();
    }
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

  const votesRaw = voteSnap.data() ?? {};
  const votes = Object.entries(votesRaw)
    .filter(([k]) => k !== "updatedAt")
    .map(([voterId, targetId]) => ({ voterId, targetId: (targetId as string) || null }));

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
  await batch.commit();

  const voteRecord: Record<string, string | null | undefined> = {};
  for (const [k, v] of Object.entries(votesRaw)) {
    if (k === "updatedAt") continue;
    voteRecord[k] = v == null || v === "" ? null : String(v);
  }
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
