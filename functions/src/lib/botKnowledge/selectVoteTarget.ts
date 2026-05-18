import type { PlayerDawnState } from "folclore-game-engine";
import { ROLE_SIDE } from "folclore-game-engine";
import type { RoleId } from "folclore-game-engine";
import type { BotVoteReasonToken, BotKnowledgeSnapshot } from "./types.js";
import { promoteSuspects } from "./merge.js";

type VoteRng = () => number;

const THREAT_CREATURE_TO_TOWN: Partial<Record<RoleId, number>> = {
  cartomante: 10,
  delegado: 9,
  doutor: 8,
  boitata: 7,
  geni: 6,
  cangaceiro: 5,
  padre: 4,
  coronel: 3,
  mae_de_santo: 2,
  aldeao: 1,
};

const THREAT_MORADOR_TO_FOLKLORE: Partial<Record<RoleId, number>> = {
  lobisomem: 10,
  mula: 8,
  iara: 7,
  saci: 6,
  boto: 5,
};

function threatScore(
  candidateId: string,
  enemyRoleKnown: Partial<Record<string, RoleId>>,
  tableForCreatureSide: boolean,
): number {
  const r = enemyRoleKnown[candidateId];
  if (!r) return 0;
  if (tableForCreatureSide) return THREAT_CREATURE_TO_TOWN[r] ?? 2;
  return THREAT_MORADOR_TO_FOLKLORE[r] ?? 2;
}

/** Creatures choose among morador-side vote targets; vice versa. */
export function prioritizeByThreat(args: {
  candidateIds: string[];
  enemyRoleKnown: Partial<Record<string, RoleId>>;
  botFightsForTown: boolean;
  rng: VoteRng;
}): string {
  const { candidateIds, enemyRoleKnown, botFightsForTown, rng } = args;
  if (candidateIds.length === 1) return candidateIds[0]!;
  const scored = candidateIds.map((id) => ({
    id,
    s: threatScore(id, enemyRoleKnown, botFightsForTown),
  }));
  scored.sort((a, b) => b.s - a.s || (rng() - 0.5));
  return scored[0]!.id;
}

function randomPick<T>(arr: T[], rng: VoteRng): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

export function playerFightsForTownTeam(
  secretsRole: RoleId,
  alignment: "moradores" | "criaturas" | null | undefined,
): boolean | null {
  return botFightsForTownish(secretsRole, alignment);
}

function botFightsForTownish(
  secretsRole: RoleId,
  alignment: "moradores" | "criaturas" | null | undefined,
): boolean | null {
  const s = ROLE_SIDE[secretsRole];
  if (s === "morador") return true;
  if (s === "criatura") return false;
  if (alignment === "moradores") return true;
  if (alignment === "criaturas") return false;
  return null;
}

export function pickOppositePool(
  selfId: string,
  secretRole: RoleId,
  alignment: "moradores" | "criaturas" | null | undefined,
  entries: Array<{ id: string; state: PlayerDawnState }>,
  canTarget: (pid: string, st: PlayerDawnState) => boolean,
): string[] {
  const fight = botFightsForTownish(secretRole, alignment);
  const out: string[] = [];
  for (const { id, state } of entries) {
    if (id === selfId) continue;
    if (!canTarget(id, state)) continue;
    const sr = state.role;
    if (fight == null) {
      out.push(id);
      continue;
    }
    const targetSide = ROLE_SIDE[sr];
    if (fight && targetSide === "criatura") out.push(id);
    if (!fight && targetSide !== "criatura") out.push(id);
  }
  return out;
}

/** Select expulsion vote target for a bot. */
export function selectVoteTarget(args: {
  rng: VoteRng;
  voterId: string;
  kb: BotKnowledgeSnapshot;
  voterRole: RoleId;
  voterAlign: "moradores" | "criaturas" | null | undefined;
  aliveEntries: Array<{ id: string; state: PlayerDawnState }>;
  canTarget: (pid: string, st: PlayerDawnState) => boolean;
  /** Sací ignora modelo de suspeitas */
  saciChaos?: boolean;
}): { targetId: string | null; reason: BotVoteReasonToken } {
  const { rng, voterId, kb, voterRole, voterAlign, aliveEntries, canTarget } = args;
  const saciChaos = Boolean(args.saciChaos);

  promoteSuspects(kb);

  const poolAll = aliveEntries
    .filter(({ id, state }) => id !== voterId && canTarget(id, state))
    .map((x) => x.id);

  if (poolAll.length === 0) return { targetId: null, reason: "random" };

  if (saciChaos) return { targetId: randomPick(poolAll, rng), reason: "chaos" };

  const fight = botFightsForTownish(voterRole, voterAlign);
  const livSet = new Set(aliveEntries.filter((e) => e.state.alive && !e.state.eliminated && !e.state.expelled).map((e) => e.id));

  const confirmedEnemyAlive = kb.confirmedEnemies.filter((id) => poolAll.includes(id) && livSet.has(id));
  if (confirmedEnemyAlive.length > 0) {
    let id: string;
    if (fight != null) {
      id = prioritizeByThreat({
        candidateIds: confirmedEnemyAlive,
        enemyRoleKnown: kb.enemyRoleKnown,
        botFightsForTown: fight,
        rng,
      });
    } else {
      id = randomPick(confirmedEnemyAlive, rng);
    }
    return { targetId: id, reason: "confirmed" };
  }

  const suspected = [...kb.suspectedEnemiesWeighted].filter((e) => poolAll.includes(e.playerId) && livSet.has(e.playerId));
  suspected.sort((a, b) => b.weight - a.weight || rng() - 0.5);
  if (suspected.length && suspected[0]!.weight > 0) {
    return { targetId: suspected[0]!.playerId, reason: "suspected" };
  }

  const traitors = kb.votedAgainstMe.filter((id) => poolAll.includes(id));
  if (traitors.length) {
    return { targetId: randomPick(traitors, rng), reason: "traitor" };
  }

  const oppo = pickOppositePool(voterId, voterRole, voterAlign, aliveEntries, canTarget).filter((id) =>
    poolAll.includes(id),
  );

  const oppoNoAllies = oppo.filter((id) => !kb.confirmedAllies.includes(id));
  const pickFrom = oppoNoAllies.length ? oppoNoAllies : oppo.length ? oppo : poolAll;
  return { targetId: randomPick(pickFrom, rng), reason: "random" };
}
