/** Campos da sala usados na UI de ações do dia (alinhar com `functions/src/index.ts`). */
export type DayRoomFlags = {
  daySubPhase?: string;
  pendingSaciGorro?: boolean;
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

/** Coronel inicia acusação formal (fora de uma votação de acusação já aberta). */
export function canShowCoronelAccuse(
  myRole: string | null,
  room: DayRoomFlags,
  me: DayPlayerFlags | undefined,
): boolean {
  return (
    myRole === "coronel" &&
    isDayParticipant(me) &&
    room.daySubPhase !== "coronel_accusation"
  );
}

/** Todos os jogadores vivos participam da votação sim/não da acusação formal. */
export function canShowCoronelAccusationVotes(
  room: DayRoomFlags,
  me: DayPlayerFlags | undefined,
): boolean {
  return room.daySubPhase === "coronel_accusation" && isDayParticipant(me);
}

export function canShowCangaceiroTiro(
  myRole: string | null,
  me: DayPlayerFlags | undefined,
): boolean {
  return myRole === "cangaceiro" && isDayParticipant(me) && !me?.actionUsed;
}

/** Saci marca que há oferta Gorro (estado antes do swap). */
export function canShowSaciGorroOffer(
  myRole: string | null,
  room: DayRoomFlags,
  me: DayPlayerFlags | undefined,
): boolean {
  return myRole === "saci" && isDayParticipant(me) && !room.pendingSaciGorro;
}

/** Saci escolhe com quem trocar após oferta ativa. */
export function canShowSaciGorroSwap(
  myRole: string | null,
  room: DayRoomFlags,
  me: DayPlayerFlags | undefined,
  swapTargetId: string,
): boolean {
  return (
    myRole === "saci" &&
    isDayParticipant(me) &&
    Boolean(room.pendingSaciGorro) &&
    Boolean(swapTargetId)
  );
}
