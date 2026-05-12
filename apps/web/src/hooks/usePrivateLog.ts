import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase.js";
import type { PrivateLogEntry } from "../types.js";

export function usePrivateLog(roomCode: string, playerId: string): PrivateLogEntry[] {
  const [privateLog, setPrivateLog] = useState<PrivateLogEntry[]>([]);
  useEffect(() => {
    if (!roomCode || !playerId) {
      setPrivateLog([]);
      return;
    }
    const q = query(
      collection(db, "rooms", roomCode, "privateLog", playerId, "entries"),
      orderBy("round", "asc"),
    );
    return onSnapshot(q, (snap) =>
      setPrivateLog(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
  }, [roomCode, playerId]);
  return privateLog;
}
