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
  silenced: boolean;
  silencedRounds: number;
  enchanted: boolean;
  seduced: boolean;
  jailed: boolean;
  protected: boolean;
  invoked: boolean;
  /** Alvo salvo pelo Doutor na última noite (para não repetir). */
  doctorLastTargetId: string | null;
  /** Lobisomem já usou morder nesta partida. */
  wolfBiteUsed: boolean;
}

export interface DawnResolveInput {
  round: number;
  now: number;
  players: Record<string, PlayerDawnState>;
  nightActions: Record<string, NightActionInput | undefined>;
  /** Por `playerId` da Geni: alvos que ela já conversou (Cangaceiro / Tiro Certo). */
  geniInvestigatedIds: Record<string, string[]>;
}

export interface DawnResolveResult {
  players: Record<string, PlayerDawnState>;
  publicLog: PublicLogEntry[];
  privateLog: Record<string, PrivateLogEntry[]>;
  individualWins: IndividualWinEntry[];
  /** Efeitos visíveis agregados para copy do amanhecer. */
  dawnSummary: "death" | "bite" | "terror" | "none" | "invocation";
}
