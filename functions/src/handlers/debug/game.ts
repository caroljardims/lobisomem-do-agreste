import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { RoleId } from "folclore-game-engine";
import { maxRoundsForPlayerCount } from "folclore-game-engine";
import { db, randomCode, randomId, ROLE_SIDE, startNightSequence } from "../../helpers.js";
import { ensurePlayerPrivateDoc } from "../../lib/playerPrivateScore.js";
import { requireAuth } from "../shared.js";
import { assertLocalDebugRequest } from "./shared.js";
import { resolveDebugNightFully } from "./nightAdvance.js";

const HOST_VOTE_SENTINEL = "__HOST__";

const DEBUG_ROLE_IDS = [
  "lobisomem",
  "saci",
  "boto",
  "mula",
  "iara",
  "geni",
  "bras_cubas",
  "cangaceiro",
  "curupira",
  "doutor",
  "mae_de_santo",
  "delegado",
  "boitata",
  "cartomante",
  "padre",
  "coronel",
  "aldeao",
] satisfies RoleId[];

const BOT_NAMES = [
  "Eustácio", "Muriel", "Severino", "Benedita", "Álvaro",
  "Dona Chica", "Bentinho", "Gabriela", "Maneca", "Dorinha",
  "Lampião", "Maria Bonita", "Catirina", "Mestre Vital", "Caboclo",
];

function shuffleNames(): string[] {
  const pool = [...BOT_NAMES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool;
}

function randomRolePick(): RoleId {
  const i = Math.floor(Math.random() * DEBUG_ROLE_IDS.length);
  return DEBUG_ROLE_IDS[i]!;
}

type BotCfg = {
  name?: string;
  role?: string;
  alwaysVote?: string | null;
};

export const startDebugGame = onCall(async (req) => {
  assertLocalDebugRequest(req);
  const uid = requireAuth(req);

  const payload = req.data ?? {};
  const playerName = String(payload.playerName ?? "Debug Player").slice(0, 40);
  const playerRole = String(payload.playerRole ?? "aldeao") as RoleId;
  if (!DEBUG_ROLE_IDS.includes(playerRole)) {
    throw new HttpsError("invalid-argument", "Papel inválido.");
  }
  const totalPlayers = Math.min(12, Math.max(2, Number(payload.totalPlayers ?? 5)));
  const botsRaw = (payload.bots as BotCfg[] | undefined) ?? [];
  if (botsRaw.length !== totalPlayers - 1) {
    throw new HttpsError("invalid-argument", "lista de bots incompatível com totalPlayers.");
  }
  const startRound = Math.min(7, Math.max(1, Number(payload.startRound ?? 1)));
  const skipNight = Boolean(payload.skipNight);
  const forceMoonPhaseRaw =
    payload.forceMoonPhase === "full" || payload.forceMoonPhase === "crescent"
      ? (payload.forceMoonPhase as string)
      : null;
  const showAllRoles = Boolean(payload.showAllRoles);
  const slowMode = Boolean(payload.slowMode);

  let code = randomCode();
  let roomRef = db.collection("rooms").doc(code);
  let created = false;
  for (let att = 0; att < 10; att++) {
    const snap = await roomRef.get();
    if (!snap.exists) {
      created = true;
      break;
    }
    code = randomCode();
    roomRef = db.collection("rooms").doc(code);
  }
  if (!created) throw new HttpsError("resource-exhausted", "Sem código disponível.");

  const humanPid = randomId();
  const namePool = shuffleNames();

  const debugBotVoteTargets: Record<string, string> = {};
  const bots: Array<{ pid: string; name: string; role: RoleId }> = [];
  let nameIdx = 0;
  let nextSynth = 1;

  for (let i = 0; i < botsRaw.length; i++) {
    const b = botsRaw[i]!;
    const pid = randomId();
    const roleRaw = typeof b.role === "string" ? b.role : "random";
    const roleResolved: RoleId =
      roleRaw === "random" || !DEBUG_ROLE_IDS.includes(roleRaw as RoleId)
        ? randomRolePick()
        : (roleRaw as RoleId);
    const displayName =
      typeof b.name === "string" && b.name.trim().length > 0
        ? String(b.name).slice(0, 40)
        : namePool[nameIdx++] ?? `Bot ${nextSynth++}`;
    bots.push({ pid, name: displayName, role: roleResolved });
  }

  for (let i = 0; i < bots.length; i++) {
    const v = botsRaw[i]!.alwaysVote;
    if (v === HOST_VOTE_SENTINEL) {
      debugBotVoteTargets[bots[i]!.pid] = humanPid;
    } else if (typeof v === "string" && v.length > 0 && v !== "null") {
      debugBotVoteTargets[bots[i]!.pid] = v;
    }
  }

  const spokespersonId = humanPid;

  const isFive = totalPlayers === 5;
  const rolesById = new Map<string, RoleId>([[humanPid, playerRole]]);
  for (const b of bots) rolesById.set(b.pid, b.role);
  const moradorIdsAtStart = [humanPid, ...bots.map((b) => b.pid)].filter((id) => {
    const role = rolesById.get(id)!;
    return Boolean(role && ROLE_SIDE[role] === "morador");
  });
  const fiveTablePublicNeutralRule =
    isFive &&
    (playerRole === "curupira" ||
      playerRole === "boitata" ||
      bots.some((b) => b.role === "curupira" || b.role === "boitata"));

  const maxRounds = maxRoundsForPlayerCount(totalPlayers);

  const batch = db.batch();
  batch.set(roomRef, {
    debug: true,
    debugSlowMode: slowMode,
    debugShowAllRoles: showAllRoles,
    ...(forceMoonPhaseRaw ? { debugForceMoonPhase: forceMoonPhaseRaw } : {}),
    debugBotVoteTargets,
    debugConfig: {
      skipNightInitialized: skipNight,
      forceMoonPhase: forceMoonPhaseRaw,
      playerRole,
      startRound,
    },
    code,
    hostUid: uid,
    memberUids: [uid],
    expectedPlayerCount: totalPlayers,
    status: "night",
    round: startRound,
    phase: "night",
    maxRounds,
    spokespersonId,
    winner: null,
    individualWins: [],
    nightPhaseIndex: 0,
    currentActorRole: null,
    nightOrderRoles: [],
    votingOpen: false,
    mvpLedgerApplied: false,
    geniInvestigatedTargets: [],
    gameTablePlayerCount: totalPlayers,
    saciActedLastNight: false,
    botoEnchantedMoradores: [],
    padreCatechizedMoradores: [],
    ...(isFive && moradorIdsAtStart.length > 0 ? { fiveTableMoradorIds: moradorIdsAtStart } : {}),
    createdAt: FieldValue.serverTimestamp(),
  });

  batch.set(roomRef.collection("players").doc(humanPid), {
    id: humanPid,
    uid,
    name: playerName,
    alive: true,
    eliminated: false,
    expelled: false,
    isSpokesperson: true,
    isBot: false,
    actionUsed: false,
  });
  batch.set(roomRef.collection("secrets").doc(humanPid), {
    role: playerRole,
    side: ROLE_SIDE[playerRole],
  });

  for (const b of bots) {
    batch.set(roomRef.collection("players").doc(b.pid), {
      id: b.pid,
      uid: `bot_${b.pid}`,
      name: b.name,
      alive: true,
      eliminated: false,
      expelled: false,
      isSpokesperson: false,
      isBot: true,
      actionUsed: false,
    });
    batch.set(roomRef.collection("secrets").doc(b.pid), {
      role: b.role,
      side: ROLE_SIDE[b.role],
    });
  }

  if (fiveTablePublicNeutralRule) {
    batch.set(roomRef.collection("publicLogEntries").doc(), {
      round: startRound,
      type: "special",
      message:
        "Mesa de cinco: por regra do cordel nesta praça, quem veio da mata neste folheto conta com os moradores no placar — o duelo não pode acabar antes da praça acordar.",
      timestamp: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();

  await db.collection("users").doc(uid).set(
    { premiumSince: FieldValue.serverTimestamp() },
    { merge: true },
  );

  await ensurePlayerPrivateDoc(code, humanPid, uid);

  for (const b of bots) {
    await ensurePlayerPrivateDoc(code, b.pid, `bot_${b.pid}`);
  }

  await startNightSequence(code, startRound);

  if (skipNight) {
    await resolveDebugNightFully(code);
    const rs = await roomRef.get();
    if (forceMoonPhaseRaw === "full") {
      const r = rs.data() ?? {};
      const mr = Number(r.maxRounds ?? maxRounds);
      const cr = Number(r.round ?? startRound);
      if (mr > 0 && cr <= mr && r.status !== "ended") {
        await roomRef.update({ round: mr + 1 });
      }
    }
  }

  return { roomCode: code, playerId: humanPid };
});
