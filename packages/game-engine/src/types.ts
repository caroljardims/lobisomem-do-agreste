/** IDs estáveis de personagem (alinhar com CLAUDE.md e UI). */
export type RoleId =
  | "lobisomem"
  | "saci"
  | "mula"
  | "boto"
  | "iara"
  | "geni"
  | "bras_cubas"
  | "cangaceiro"
  | "curupira"
  | "doutor"
  | "mae_de_santo"
  | "delegado"
  | "boitata"
  | "cartomante"
  | "coronel"
  | "padre"
  | "aldeao";

export type Side = "criatura" | "neutro" | "morador";

export type RoomStatus = "lobby" | "night" | "dawn" | "day" | "ended";

export interface IndividualWinEntry {
  playerId: string;
  role: RoleId;
  type: string;
  round: number;
  timestamp: number;
}

export interface NightActionInput {
  role: RoleId;
  action: string;
  targetId: string | null;
  specialAction: string | null;
  /** Delegado: motivo público (espelha `specialAction` após normalização no backend). */
  justification?: string | null;
}

export interface PublicLogEntry {
  round: number;
  type: "death" | "bite" | "terror" | "expulsion" | "invocation" | "dawn" | "special";
  message: string;
  timestamp: number;
}

export interface PrivateLogEntry {
  round: number;
  message: string;
  timestamp: number;
}

/** Histórico de conversas da Geni (Firestore + entrada do resolveDawn). */
export interface GeniInvestigationRecord {
  playerId: string;
  /** Rodada em que a conversa ocorreu (mesmo índice que `room.round` na noite). */
  round: number;
  /** Rótulo morador/criatura na época da conversa (neutros como morador no copy). */
  result: "criatura" | "morador";
}

export interface PlayerDawnState {
  /** Igual à chave em `players` (Firestore). */
  id: string;
  name: string;
  role: RoleId;
  side: Side;
  alive: boolean;
  eliminated: boolean;
  expelled: boolean;
  blockedNextNight: boolean;
  /** Quem impôs o bloqueio na próxima noite (persistido com `blockedNextNight`). Só o Saci usa hoje. */
  nightAbilityBlockSource?: "saci" | null;
  silenced: boolean;
  silencedRounds: number;
  enchanted: boolean;
  seduced: boolean;
  jailed: boolean;
  protected: boolean;
  invoked: boolean;
  /** Alvo salvo pelo Doutor na última noite (para não repetir). */
  doctorLastTargetId: string | null;
  /** Delegado: última pessoa presa (não pode prender a mesma em noites consecutivas). */
  delegadoLastJailedId?: string | null;
  /** Lobisomem já usou morder nesta partida. */
  wolfBiteUsed: boolean;
  /** Mula já usou Exorcismo da Vingança nesta partida. */
  mulaExorcizeUsed: boolean;
  /** Geni já usou Charme de Verdade nesta partida. */
  geniCharmUsed: boolean;
  /** Catequizado pelo Padre nesta rodada — imune a Iara e Mula nessa noite. */
  catechized: boolean;
  /** Iara: não pode usar sedução enquanto `round <= este valor` (após Voz Encantadora). */
  iaraSeductionBlockedThroughRound?: number | null;
}

export interface DawnResolveInput {
  round: number;
  now: number;
  players: Record<string, PlayerDawnState>;
  nightActions: Record<string, NightActionInput | undefined>;
  /** Por `playerId` da Geni: conversas acumuladas (com rodada) para Cangaceiro / Romance no amanhecer. */
  geniInvestigatedIds: Record<string, GeniInvestigationRecord[]>;
}

export interface DawnResolveResult {
  players: Record<string, PlayerDawnState>;
  publicLog: PublicLogEntry[];
  privateLog: Record<string, PrivateLogEntry[]>;
  individualWins: IndividualWinEntry[];
  /** Efeitos visíveis agregados para copy do amanhecer. */
  dawnSummary: "death" | "bite" | "terror" | "none" | "invocation";
}
