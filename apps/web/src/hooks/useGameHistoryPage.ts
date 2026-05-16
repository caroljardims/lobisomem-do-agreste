import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { db } from "../firebase.js";

export type GameHistoryRow = {
  id: string;
  roomCode: string;
  playedAt: Date | null;
  winner: string;
  rounds: number;
  players: Array<{
    playerId: string;
    uid: string;
    displayName: string;
    role: string;
    side: string;
    points: number;
    rank: number;
    individualObjectiveMet: boolean;
    collectiveWin: boolean;
  }>;
};

const PAGE = 10;

export function useGameHistoryPage(uid: string | undefined) {
  const [rows, setRows] = useState<GameHistoryRow[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mapDoc = (d: QueryDocumentSnapshot<DocumentData>): GameHistoryRow => {
    const x = d.data() as Record<string, unknown>;
    const playedRaw = x.playedAt as { toDate?: () => Date } | undefined;
    const playedAt =
      playedRaw && typeof playedRaw.toDate === "function" ? playedRaw.toDate() : null;
    return {
      id: d.id,
      roomCode: String(x.roomCode ?? ""),
      playedAt,
      winner: String(x.winner ?? ""),
      rounds: Number(x.rounds ?? 0),
      players: Array.isArray(x.players) ? (x.players as GameHistoryRow["players"]) : [],
    };
  };

  const reset = useCallback(() => {
    setRows([]);
    setLastDoc(null);
    setHasMore(true);
    setError(null);
  }, []);

  useEffect(() => {
    reset();
  }, [uid, reset]);

  const loadPage = useCallback(
    async (after: QueryDocumentSnapshot<DocumentData> | null) => {
      if (!uid) return;
      setLoading(true);
      setError(null);
      try {
        const snap = await getDocs(
          query(
            collection(db, "gameHistory"),
            where("participantUids", "array-contains", uid),
            orderBy("playedAt", "desc"),
            limit(PAGE),
            ...(after ? [startAfter(after)] : []),
          ),
        );
        const next = snap.docs.map(mapDoc);
        setRows((prev) => (after ? [...prev, ...next] : next));
        const last = snap.docs[snap.docs.length - 1] ?? null;
        setLastDoc(last);
        setHasMore(snap.docs.length === PAGE);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao carregar histórico.");
      } finally {
        setLoading(false);
      }
    },
    [uid],
  );

  useEffect(() => {
    if (!uid) return;
    void loadPage(null);
  }, [uid, loadPage]);

  const loadMore = useCallback(() => {
    if (!uid || !hasMore || loading || !lastDoc) return;
    void loadPage(lastDoc);
  }, [uid, hasMore, loading, lastDoc, loadPage]);

  return { rows, hasMore, loading, error, loadMore };
}
