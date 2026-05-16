import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase.js";

export type GameSummaryPlayer = {
  playerId: string;
  uid: string;
  displayName: string;
  role: string;
  side: string;
  points: number;
  rank: number;
  isBot?: boolean;
  individualObjectiveMet: boolean;
  collectiveWin: boolean;
  breakdown: {
    suspicion: number;
    voteEnemy: number;
    voteExpelledBonus: number;
    investigation: number;
    objective: number;
    survival: number;
    brasRoundTease: number;
  };
};

export type GameSummaryDoc = {
  roomCode?: string;
  winner?: string;
  rounds?: number;
  players?: GameSummaryPlayer[];
};

export function useGameSummary(gameId: string | undefined) {
  const [summary, setSummary] = useState<GameSummaryDoc | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId) {
      setSummary(null);
      setLoaded(false);
      setError(null);
      return;
    }
    const ref = doc(db, "gameHistory", gameId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setLoaded(true);
        setError(null);
        if (!snap.exists()) setSummary(null);
        else setSummary(snap.data() as GameSummaryDoc);
      },
      (err) => {
        setLoaded(true);
        setSummary(null);
        setError(err.code === "permission-denied" ? "Sem permissão para ler o resumo desta partida." : "Erro ao carregar resumo.");
      },
    );
    return () => unsub();
  }, [gameId]);

  return { summary, loaded, error };
}
