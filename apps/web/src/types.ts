import type { DocumentData } from "firebase/firestore";
import type { ReactNode } from "react";

export type LoreSection =
  | { kind: "kv"; title: string; content: ReactNode }
  | { kind: "aside"; text: ReactNode };

export type LoreRich = {
  narrative: string;
  sections: LoreSection[];
};

export type View = "intro" | "create" | "join" | "joinName";

export type RoomDoc = DocumentData & {
  status?: string;
  hostUid?: string;
  expectedPlayerCount?: number;
  round?: number;
  /** Teto de rodadas antes da vitória automática do folclore (lua cheia). */
  maxRounds?: number;
  spokespersonId?: string;
  currentActorRole?: string | null;
  nightPendingRoles?: string[];
  votingOpen?: boolean;
  votesRound?: number;
  pendingBrasChoice?: boolean;
  pendingNightStart?: boolean;
  pendingNightRound?: number;
  winner?: string | null;
  daySubPhase?: string;
  pendingSaciGorro?: {
    saciPlayerId: string;
    expiresAt: { seconds: number; nanoseconds?: number } | number;
    round?: number;
  } | null;
  coronelAccusationTarget?: string;
  revealedRoles?: Record<string, string>;
  /** Vitórias individuais (não encerram a partida sozinhas); ver `individualWinChronicleLine`. */
  individualWins?: Array<{
    playerId: string;
    role: string;
    type: string;
    round: number;
    timestamp: number;
  }>;
  lastGameHistoryId?: string;
  mvpLedgerApplied?: boolean;
  geniInvestigatedTargets?: string[];
  /** Congelado em `startGame` (jogadores conectados ao iniciar). */
  gameTablePlayerCount?: number;
  /** Sala criada via modo debug (localhost). Exclui MVP / histórico público. */
  debug?: boolean;
  debugSlowMode?: boolean;
  debugShowAllRoles?: boolean;
  debugBotVoteTargets?: Record<string, string>;
  debugForceMoonPhase?: "crescent" | "full" | string | null;
  debugConfig?: Record<string, unknown>;
  /** Fim por empate 7+ no placar (criaturas === moradores); texto distinto na crônica e na tela final. */
  collectiveEndKind?: string;
  /** Só mesa de 5: ids de jogadores com papel de lado morador no início (objetivo Curupira/Boitatá). */
  fiveTableMoradorIds?: string[];
};

export type PlayerDoc = DocumentData & {
  id?: string;
  name?: string;
  uid?: string;
  alive?: boolean;
  eliminated?: boolean;
  expelled?: boolean;
  isSpokesperson?: boolean;
  isBot?: boolean;
  wolfBiteUsed?: boolean;
  mulaExorcizeUsed?: boolean;
  geniCharmUsed?: boolean;
  iaraSeductionBlockedThroughRound?: number | null;
  actionUsed?: boolean;
  publicReveal?: string;
  seduced?: boolean;
  jailed?: boolean;
  silenced?: boolean;
  invoked?: boolean;
  individualObjectiveMet?: boolean;
  alignment?: string;
  /** Mesa de 5: moradores distintos já protegidos (Curupira). */
  curupiraFiveMoradoresProtected?: string[];
  /** Mesa de 5: moradores distintos já investigados (Boitatá). */
  boitataFiveMoradoresInvestigated?: string[];
  delegadoLastJailedId?: string | null;
};

export type PublicLogEntry = { id: string; message?: string; round?: number; type?: string };
export type PrivateLogEntry = { id: string; message?: string; round?: number };
export type ChatMessage = { id: string; name?: string; text?: string; type?: string };
