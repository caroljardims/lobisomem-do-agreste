import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { NightActionInput, PlayerDawnState, Side, WinPlayerSnapshot } from "folclore-game-engine";
import {
  resolveDawn,
  DAY_OPENING,
  tallyExpulsionVotes,
  checkCollectiveWin,
} from "folclore-game-engine";
import type { RoleId } from "folclore-game-engine";
import { db } from "./db.js";
import { loadPlayers, loadSecrets } from "../helpers.js";

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
      silenced: Boolean(p.silenced),
      silencedRounds: Number(p.silencedRounds ?? 0),
      enchanted: Boolean(p.enchanted),
      seduced: Boolean(p.seduced),
      jailed: Boolean(p.jailed),
      protected: Boolean(p.protected),
      invoked: Boolean(p.invoked),
      doctorLastTargetId: (p.doctorLastTargetId as string | null) ?? null,
      wolfBiteUsed: Boolean(p.wolfBiteUsed),
      mulaExorcizeUsed: Boolean(p.mulaExorcizeUsed),
      geniCharmUsed: Boolean(p.geniCharmUsed),
      catechized: Boolean(p.catechized),
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
      silenced: pl.silenced,
      silencedRounds: pl.silencedRounds,
      enchanted: pl.enchanted,
      seduced: pl.seduced,
      jailed: pl.jailed,
      invoked: pl.invoked,
      doctorLastTargetId: pl.doctorLastTargetId ?? null,
    };
    if (pl.silenced) upd.silencedUntil = Timestamp.fromMillis(now + 120_000);
    else upd.silencedUntil = FieldValue.delete();
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
    if (botoAction?.targetId) {
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
    if (padreAction?.targetId) {
      const targetSec = secrets[padreAction.targetId];
      if (targetSec?.side === "morador" && !padreCatechizedMoradores.includes(padreAction.targetId)) {
        padreCatechizedMoradores = [...padreCatechizedMoradores, padreAction.targetId];
      }
    }
  }

  const saciId = players.find((p) => secrets[p.id]?.role === "saci")?.id;
  const saciJailed = saciId ? Boolean(res.players[saciId]?.jailed) : false;

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
    ...(saciJailed ? { pendingSaciGorro: true } : {}),
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
        );
      }
    }
  }

  await Promise.all(postObjectiveUpdates);

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
    for (const p of aliveNow) {
      if (!botIds.has(p.id) || p.seduced || p.jailed) continue;
      const targets = aliveHumans.length > 0 ? aliveNow.filter((t) => t.id !== p.id) : [];
      botVotes[p.id] = targets.length > 0 ? targets[Math.floor(Math.random() * targets.length)].id : null;
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
    const forcedWinner = checkCollectiveWin(wpCheck, round, Number(room.maxRounds ?? 7)) ?? "bots";
    const revealedRolesCheck: Record<string, string> = {};
    for (const p of players) {
      const r = secrets[p.id]?.role;
      if (r) revealedRolesCheck[p.id] = r;
    }
    await roomRef.update({ status: "ended", phase: "ended", winner: forcedWinner, votingOpen: false, revealedRoles: revealedRolesCheck });
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

  if (tally.expelledId && secrets[tally.expelledId]?.role === "bras_cubas") {
    const brasPlayer = players.find((p) => p.id === tally.expelledId);
    if (brasPlayer?.isBot) {
      const revealedRoles: Record<string, string> = {};
      for (const p of players) {
        const r = secrets[p.id]?.role;
        if (r) revealedRoles[p.id] = r;
      }
      await roomRef.update({
        status: "ended",
        phase: "ended",
        winner: brasPlayer.id,
        pendingBrasChoice: false,
        votingOpen: false,
        revealedRoles,
      });
    }
    return;
  }

  if (tally.expelledId) {
    const [snaps, sec] = await Promise.all([loadPlayers(roomCode), loadSecrets(roomCode)]);
    const winPlayers: Record<string, WinPlayerSnapshot> = {};
    for (const p of snaps) {
      const r = sec[p.id]?.role;
      if (!r) continue;
      winPlayers[p.id] = {
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
    const w = checkCollectiveWin(winPlayers, round, Number(room.maxRounds ?? 7));
    if (w) {
      const revealedRoles: Record<string, string> = {};
      for (const p of snaps) {
        const r = sec[p.id]?.role;
        if (r) revealedRoles[p.id] = r;
      }
      await roomRef.update({ status: "ended", phase: "ended", winner: w, votingOpen: false, revealedRoles });
      return;
    }
  }

  const nextRound = round + 1;
  await roomRef.update({ pendingNightStart: true, pendingNightRound: nextRound });
}
