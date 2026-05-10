import type { RoleId } from "./types.js";
import { isCreatureRole } from "./roles.js";

export interface VoteEntry {
  voterId: string;
  targetId: string | null;
}

export interface VoteTallyOptions {
  /** Se true, cada voto em `brasPlayerId` conta como dois (Saci + Brás). */
  doubleVotesOnBras?: boolean;
  brasPlayerId?: string | null;
  /** Votantes encantados não podem votar em criaturas — votos inválidos são tratados como null. */
  enchantedVoterIds?: Set<string>;
  /** roleId por jogador para validar encantamento. */
  roleByPlayerId?: Record<string, RoleId>;
}

/**
 * Conta votos; empate → sem expulsão (`expelledId` null).
 */
export function tallyExpulsionVotes(
  votes: VoteEntry[],
  options: VoteTallyOptions = {},
): { expelledId: string | null; counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  const { doubleVotesOnBras, brasPlayerId, enchantedVoterIds, roleByPlayerId } = options;

  for (const v of votes) {
    if (!v.targetId) continue;
    if (enchantedVoterIds?.has(v.voterId) && roleByPlayerId) {
      const targetRole = roleByPlayerId[v.targetId];
      if (targetRole && isCreatureRole(targetRole)) continue;
    }
    const w = doubleVotesOnBras && brasPlayerId && v.targetId === brasPlayerId ? 2 : 1;
    counts[v.targetId] = (counts[v.targetId] ?? 0) + w;
  }

  let best = -1;
  for (const c of Object.values(counts)) {
    if (c > best) best = c;
  }
  if (best <= 0) return { expelledId: null, counts };

  const leaders = Object.entries(counts)
    .filter(([, c]) => c === best)
    .map(([id]) => id);
  if (leaders.length !== 1) return { expelledId: null, counts };
  return { expelledId: leaders[0]!, counts };
}
