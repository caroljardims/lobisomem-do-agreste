/** Jogador que ainda pode receber voto de expulsão (vivo na cidade, ou invocado neste dia). */
export function canBeExpulsionVoteTarget(p: {
  alive?: unknown;
  eliminated?: unknown;
  expelled?: unknown;
  invoked?: unknown;
}): boolean {
  if (Boolean(p.expelled)) return false;
  if (Boolean(p.invoked)) return true;
  if (p.alive === false) return false;
  if (Boolean(p.eliminated)) return false;
  return true;
}

/** Quem pode enviar voto de expulsão nesta rodada. */
export function canSubmitExpulsionVote(p: {
  alive?: unknown;
  eliminated?: unknown;
  expelled?: unknown;
  invoked?: unknown;
  seduced?: unknown;
  jailed?: unknown;
}): boolean {
  if (Boolean(p.expelled)) return false;
  if (Boolean(p.seduced) || Boolean(p.jailed)) return false;
  if (Boolean(p.invoked)) return true;
  if (p.alive === false) return false;
  if (Boolean(p.eliminated)) return false;
  return true;
}
