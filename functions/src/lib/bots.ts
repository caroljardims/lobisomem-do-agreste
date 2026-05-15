import { FieldValue } from "firebase-admin/firestore";
import type { NightActionInput, RoleId } from "folclore-game-engine";
import { db } from "./db.js";
import { loadPlayers, loadSecrets } from "../helpers.js";
import { setNightSuspicion } from "./playerPrivateScore.js";

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
  padre: "catechize",
  boitata: "investigate",
  cartomante: "investigate",
  delegado: "jail",
};

/** Runs bot night actions. Callers must invoke `maybeFinalizeNight` after this returns. */
export async function processBotNightActions(roomCode: string, round: number): Promise<void> {
  const roomRef = db.collection("rooms").doc(roomCode);
  const roomSnap = await roomRef.get();
  const room = roomSnap.data() ?? {};

  const pendingRoles = (room.nightPendingRoles as RoleId[]) ?? [];

  const tablePlayerCountN =
    room.gameTablePlayerCount != null ? Number(room.gameTablePlayerCount) : undefined;

  const [players, secrets] = await Promise.all([loadPlayers(roomCode), loadSecrets(roomCode)]);

  const botIds = new Set(players.filter((p) => Boolean(p.isBot)).map((p) => p.id));
  if (botIds.size === 0) return;

  const alive = players.filter((p) => p.alive !== false && !p.eliminated && !p.expelled);
  const eliminated = players.filter((p) => p.eliminated && !p.expelled);
  const pendingSet = new Set<RoleId>(pendingRoles);
  const readyBotIds = alive
    .filter((p) => botIds.has(p.id) && !pendingSet.has(secrets[p.id]?.role as RoleId))
    .map((p) => p.id);

  const nightRef = roomRef.collection("nightActions").doc(String(round));
  const remainingPending: RoleId[] = [];
  let geniInvestigatedTargets = [...((room.geniInvestigatedTargets as string[]) ?? [])];

  const privSnap = await roomRef.collection("playerPrivate").get();
  const usedByPlayer = new Map<string, string[]>();
  for (const d of privSnap.docs) {
    usedByPlayer.set(d.id, (d.data().investigationTargetsUsed as string[]) ?? []);
  }

  for (const role of pendingRoles) {
    const actor = alive.find((p) => secrets[p.id]?.role === role);

    if (!actor || !botIds.has(actor.id)) {
      remainingPending.push(role);
      continue;
    }

    if (room.debug === true && Boolean(room.debugSlowMode)) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    let targets = alive.filter((p) => p.id !== actor.id);
    if (role === "mae_de_santo") {
      targets = eliminated.filter((p) => p.id !== actor.id);
    }

    let action = BOT_ROLE_ACTIONS[role] ?? "eliminate";
    let targetId: string | null = null;
    let specialAction: string | null = null;

    if (role === "mae_de_santo" && targets.length === 0) {
      action = "pass";
    } else if (role === "doutor") {
      const last = (actor.doctorLastTargetId as string | undefined) ?? null;
      const pool = last ? targets.filter((t) => t.id !== last) : targets;
      if (pool.length === 0) action = "pass";
      else targetId = pool[Math.floor(Math.random() * pool.length)]!.id;
    } else if (role === "cartomante" || role === "boitata") {
      if (round === 1) {
        if (tablePlayerCountN !== 5) {
          specialAction = Math.random() < 0.5 ? "moradores" : "criaturas";
        }
        targetId = targets.length > 0 ? targets[Math.floor(Math.random() * targets.length)]!.id : null;
      } else {
        const used = usedByPlayer.get(actor.id) ?? [];
        const pool = targets.filter((t) => !used.includes(t.id));
        if (pool.length === 0) action = "pass";
        else targetId = pool[Math.floor(Math.random() * pool.length)]!.id;
      }
    } else if (role === "geni") {
      const convPool = targets.filter((t) => !geniInvestigatedTargets.includes(t.id));
      if (convPool.length > 0) {
        action = "converse";
        targetId = convPool[Math.floor(Math.random() * convPool.length)]!.id;
      } else if (!Boolean(actor.geniCharmUsed) && targets.length > 0) {
        action = "charm";
        targetId = targets[Math.floor(Math.random() * targets.length)]!.id;
        if (!Boolean(actor.blockedNextNight)) {
          await roomRef.collection("players").doc(actor.id).update({ geniCharmUsed: true });
        }
      } else {
        action = "pass";
      }
    } else if (role === "delegado") {
      const lastJailed = (actor.delegadoLastJailedId as string | undefined) ?? null;
      const pool = lastJailed ? targets.filter((t) => t.id !== lastJailed) : targets;
      if (pool.length === 0) {
        action = "pass";
      } else {
        targetId = pool[Math.floor(Math.random() * pool.length)]!.id;
        const targetName = alive.find((p) => p.id === targetId)?.name ?? "o suspeito";
        const motivos = [
          `${targetName} foi visto rondando a praça depois do toque de recolher.`,
          `Denúncia anônima aponta ${targetName} como perturbador da ordem pública.`,
          `${targetName} apresentou comportamento suspeito na última reunião.`,
          `Ordens do Coronel: ${targetName} precisa ser contido.`,
          `${targetName} foi flagrado próximo aos celeiros na madrugada.`,
          `Testemunha ocular viu ${targetName} nas bordas da caatinga à noite.`,
          `${targetName} descumpriu o toque de recolher por três noites seguidas.`,
          `Há indícios de que ${targetName} está espalhando boatos contra a ordem.`,
        ];
        specialAction = motivos[Math.floor(Math.random() * motivos.length)];
      }
    } else {
      targetId = targets.length > 0 ? targets[Math.floor(Math.random() * targets.length)]!.id : null;
      if (role === "curupira" && round === 1 && tablePlayerCountN !== 5) {
        specialAction = Math.random() < 0.5 ? "moradores" : "criaturas";
      }
    }

    const submission: NightActionInput = {
      role: role as RoleId,
      action,
      targetId,
      specialAction,
    };

    await nightRef.set(
      { [actor.id]: submission, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    readyBotIds.push(actor.id);

    if (
      role === "geni" &&
      targetId &&
      action === "converse" &&
      !geniInvestigatedTargets.includes(targetId) &&
      !Boolean(actor.blockedNextNight)
    ) {
      geniInvestigatedTargets = [...geniInvestigatedTargets, targetId];
    }
  }

  const roomUpdates: Record<string, unknown> = {};
  if (remainingPending.length !== pendingRoles.length) roomUpdates.nightPendingRoles = remainingPending;
  if (readyBotIds.length > 0) roomUpdates.nightReadyPlayerIds = FieldValue.arrayUnion(...readyBotIds);
  const initialGeni = (room.geniInvestigatedTargets as string[]) ?? [];
  if (geniInvestigatedTargets.length !== initialGeni.length) {
    roomUpdates.geniInvestigatedTargets = geniInvestigatedTargets;
  }
  if (Object.keys(roomUpdates).length > 0) {
    await roomRef.update(roomUpdates);
  }

  for (const p of alive) {
    if (!botIds.has(p.id)) continue;
    if (secrets[p.id]?.role !== "cangaceiro") continue;
    if (room.debug === true && Boolean(room.debugSlowMode)) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    const others = alive.filter((x) => x.id !== p.id);
    const pass = others.length === 0 || Math.random() < 0.75;
    const submission: NightActionInput = pass
      ? { role: "cangaceiro", action: "pass", targetId: null, specialAction: null }
      : {
          role: "cangaceiro",
          action: "query",
          targetId: others[Math.floor(Math.random() * others.length)]!.id,
          specialAction: null,
        };
    await nightRef.set(
      { [p.id]: submission, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }

  for (const p of alive) {
    if (!botIds.has(p.id)) continue;
    const others = alive.filter((x) => x.id !== p.id);
    const suspicionTarget =
      others.length === 0 ? null : others[Math.floor(Math.random() * others.length)]!.id;
    await setNightSuspicion(roomCode, p.id, String(p.uid ?? ""), suspicionTarget).catch(() => {});
  }
}
