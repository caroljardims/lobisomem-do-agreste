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
  pendingSaciGorro?: boolean;
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
};

export type PublicLogEntry = { id: string; message?: string; round?: number; type?: string };
export type PrivateLogEntry = { id: string; message?: string; round?: number };
export type ChatMessage = { id: string; name?: string; text?: string; type?: string };
