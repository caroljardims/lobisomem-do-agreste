import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase.js";
import type { RoomDoc } from "../types.js";

export function useDayVotes(roomCode: string, room: RoomDoc | null): Record<string, string | null> {
  const [dayRoundVotes, setDayRoundVotes] = useState<Record<string, string | null>>({});
  useEffect(() => {
    if (!roomCode || !room || room.status !== "day") {
      setDayRoundVotes({});
      return;
    }
    const round = String(Number(room.votesRound ?? room.round ?? 1));
    return onSnapshot(doc(db, "rooms", roomCode, "votes", round), (snap) => {
      const raw = snap.data() as Record<string, unknown> | undefined;
      if (!raw) {
        setDayRoundVotes({});
        return;
      }
      const next: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (k === "updatedAt") continue;
        next[k] = v == null || v === undefined ? null : String(v);
      }
      setDayRoundVotes(next);
    });
  }, [roomCode, room?.status, room?.votesRound, room?.round]);
  return dayRoundVotes;
}
