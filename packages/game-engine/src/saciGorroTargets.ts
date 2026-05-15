/** Minimal player shape for Saci Gorro target selection. */
export type GorroPlayerSnap = {
  id: string;
  alive?: boolean;
  eliminated?: boolean;
  expelled?: boolean;
};

export function livingTargetsExcept(players: GorroPlayerSnap[], saciId: string): GorroPlayerSnap[] {
  return players.filter(
    (p) =>
      p.id !== saciId &&
      p.alive !== false &&
      !p.eliminated &&
      !p.expelled,
  );
}

export function pickRandomGorroTarget(targets: GorroPlayerSnap[]): string | null {
  if (targets.length === 0) return null;
  return targets[Math.floor(Math.random() * targets.length)]!.id;
}
