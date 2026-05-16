/** Campos da sala usados na UI de ações do dia (alinhar com `functions/src/index.ts`). */
export type DayRoomFlags = {
  daySubPhase?: string;
  pendingSaciGorro?:
    | {
        saciPlayerId: string;
        expiresAt: unknown;
        round?: number;
      }
    | boolean
    | null;
};

export type DayPlayerFlags = {
  alive?: boolean;
  eliminated?: boolean;
  expelled?: boolean;
  actionUsed?: boolean;
};

export function isDayParticipant(p: DayPlayerFlags | undefined): boolean {
  if (!p) return false;
  return p.alive !== false && !p.eliminated && !p.expelled;
}

export function hasPendingSaciGorro(room: DayRoomFlags | undefined): boolean {
  const p = room?.pendingSaciGorro;
  return p != null && typeof p === "object" && "saciPlayerId" in p;
}

/** Coronel pode usar acusação formal uma vez (enquanto `actionUsed` for false). */
export function canShowCoronelAccuse(
  myRole: string | null,
  room: DayRoomFlags,
  me: DayPlayerFlags | undefined,
): boolean {
  return myRole === "coronel" && isDayParticipant(me) && !me?.actionUsed;
}

export function canShowCangaceiroTiro(
  myRole: string | null,
  me: DayPlayerFlags | undefined,
): boolean {
  return myRole === "cangaceiro" && isDayParticipant(me) && !me?.actionUsed;
}
