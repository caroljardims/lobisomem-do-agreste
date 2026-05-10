import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import type { NightActionInput, PlayerDawnState, Side } from "folclore-game-engine";
import {
  NIGHT_ACTION_ORDER,
  ROLE_SIDE,
  resolveDawn,
  DAY_OPENING,
} from "folclore-game-engine";
import type { RoleId } from "folclore-game-engine";

/** Deve rodar antes de `getFirestore()` — o deploy analisa o módulo antes do corpo de `index.ts`. */
if (!getApps().length) {
  initializeApp();
}

export const db = getFirestore();

export function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const len = 4;
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function loadPlayers(roomCode: string) {
  const snap = await db.collection("rooms").doc(roomCode).collection("players").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<
    Record<string, unknown> & { id: string; uid: string; name?: string }
  >;
}

export async function loadSecrets(roomCode: string) {
  const snap = await db.collection("rooms").doc(roomCode).collection("secrets").get();
  const map: Record<string, { role: RoleId; side: Side }> = {};
  for (const d of snap.docs) {
    const data = d.data() as { role: RoleId; side: Side };
    map[d.id] = data;
  }
  return map;
}

export function nightRolesInPlay(secrets: Record<string, { role: RoleId }>, alive: Set<string>): RoleId[] {
  const inGame = new Set<RoleId>();
  for (const pid of alive) {
    const s = secrets[pid];
    if (s) inGame.add(s.role);
  }
  return NIGHT_ACTION_ORDER.filter((r) => inGame.has(r));
}

export async function startNightSequence(roomCode: string, round: number) {
  const players = await loadPlayers(roomCode);
  const secrets = await loadSecrets(roomCode);
  const alive = new Set(
    players.filter((p) => p.alive !== false && !p.eliminated && !p.expelled).map((p) => p.id),
  );
  const order = nightRolesInPlay(secrets, alive);
  const first = order[0] ?? null;
  await db
    .collection("rooms")
    .doc(roomCode)
    .update({
      status: "night",
      phase: "night",
      round,
      nightPhaseIndex: 0,
      currentActorRole: first,
      nightOrderRoles: order,
      saciActedThisNight: false,
    });
}

export async function finalizeNight(roomCode: string, round: number) {
  const roomRef = db.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  const room = roomSnap.data() ?? {};
  const geniHistory = (room.geniInvestigatedTargets as string[] | undefined) ?? [];

  const players = await loadPlayers(roomCode);
  const secrets = await loadSecrets(roomCode);
  const nightSnap = await roomRef.collection("nightActions").doc(String(round)).get();
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

  batch.update(roomRef, {
    status: "day",
    phase: "day",
    currentActorRole: null,
    nightPhaseIndex: 0,
    nightOrderRoles: [],
    votingOpen: false,
    saciActedLastNight: saciActed,
    individualWins: wins,
    geniInvestigatedTargets: [],
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
}

const BOT_ROLE_ACTIONS: Partial<Record<string, string>> = {
  lobisomem: "eliminate",
  saci: "steal",
  mula: "terrorize",
  boto: "enchant",
  iara: "seduce",
  curupira: "protect",
  doutor: "save",
  mae_de_santo: "invoke",
  geni: "converse",
  boitata: "investigate",
  cartomante: "investigate",
  delegado: "jail",
  cangaceiro: "query",
};

export async function processBotNightActions(roomCode: string, round: number): Promise<void> {
  const roomRef = db.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  const room = roomSnap.data() ?? {};

  const order = (room.nightOrderRoles as RoleId[]) ?? [];
  let idx = Number(room.nightPhaseIndex ?? 0);

  const players = await loadPlayers(roomCode);
  const secrets = await loadSecrets(roomCode);

  const botIds = new Set(players.filter((p) => Boolean(p.isBot)).map((p) => p.id));
  if (botIds.size === 0) return;

  const alive = players.filter((p) => p.alive !== false && !p.eliminated && !p.expelled);
  const eliminated = players.filter((p) => p.eliminated || p.expelled);

  while (idx < order.length) {
    const role = order[idx];
    const actor = alive.find((p) => secrets[p.id]?.role === role);

    if (!actor || !botIds.has(actor.id)) break;

    let targets = alive.filter((p) => p.id !== actor.id);
    if (role === "mae_de_santo") {
      targets = eliminated.filter((p) => p.id !== actor.id);
    }
    const targetId =
      targets.length > 0 ? targets[Math.floor(Math.random() * targets.length)].id : null;

    const action = BOT_ROLE_ACTIONS[role] ?? "eliminate";
    let specialAction: string | null = null;
    if ((role === "curupira" || role === "boitata") && round === 1) {
      specialAction = Math.random() < 0.5 ? "moradores" : "criaturas";
    }

    const submission: NightActionInput = {
      role: role as RoleId,
      action,
      targetId,
      specialAction,
    };

    const nightRef = roomRef.collection("nightActions").doc(String(round));
    await nightRef.set(
      { [actor.id]: submission, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    if (role === "geni" && targetId) {
      const snap = await roomRef.get();
      const prev = (snap.data()?.geniInvestigatedTargets as string[]) ?? [];
      if (!prev.includes(targetId)) {
        await roomRef.update({ geniInvestigatedTargets: [...prev, targetId] });
      }
    }
    if (role === "saci") {
      await roomRef.update({ saciActedThisNight: true });
    }

    idx++;
  }

  if (idx >= order.length) {
    await finalizeNight(roomCode, round);
  } else {
    await roomRef.update({ nightPhaseIndex: idx, currentActorRole: order[idx] });
  }
}

export { ROLE_SIDE };
