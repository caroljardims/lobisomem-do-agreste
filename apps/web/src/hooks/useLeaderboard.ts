import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { db } from "../firebase.js";

export type LeaderRow = {
  uid: string;
  displayName: string;
  totalPoints: number;
  gamesPlayed: number;
  mvpCount: number;
};

export function useLeaderboard(currentUid: string | undefined) {
  const [top, setTop] = useState<LeaderRow[]>([]);
  const [mine, setMine] = useState<LeaderRow | null>(null);

  const qTop = useMemo(
    () => query(collection(db, "publicLeaderboard"), orderBy("totalPoints", "desc"), limit(20)),
    [],
  );

  useEffect(() => {
    const unsub = onSnapshot(qTop, (snap) => {
      const rows: LeaderRow[] = [];
      for (const d of snap.docs) {
        const x = d.data() as Record<string, unknown>;
        rows.push({
          uid: d.id,
          displayName: String(x.displayName ?? "Jogador"),
          totalPoints: Number(x.totalPoints ?? 0),
          gamesPlayed: Number(x.gamesPlayed ?? 0),
          mvpCount: Number(x.mvpCount ?? 0),
        });
      }
      setTop(rows);
    });
    return () => unsub();
  }, [qTop]);

  useEffect(() => {
    if (!currentUid) {
      setMine(null);
      return;
    }
    const ref = doc(db, "publicLeaderboard", currentUid);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setMine(null);
        return;
      }
      const x = snap.data() as Record<string, unknown>;
      setMine({
        uid: snap.id,
        displayName: String(x.displayName ?? "Jogador"),
        totalPoints: Number(x.totalPoints ?? 0),
        gamesPlayed: Number(x.gamesPlayed ?? 0),
        mvpCount: Number(x.mvpCount ?? 0),
      });
    });
    return () => unsub();
  }, [currentUid]);

  const myRank = useMemo(() => {
    if (!currentUid) return null;
    const idx = top.findIndex((r) => r.uid === currentUid);
    return idx >= 0 ? idx + 1 : null;
  }, [currentUid, top]);

  return { top, mine, myRank };
}
