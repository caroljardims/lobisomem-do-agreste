import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase.js";

export type SecretDoc = {
  role?: string;
};

/**
 * Subscribe to `rooms/{code}/secrets` (read allowed for authed players per rules).
 */
export function useAllSecrets(roomCode: string | "", enabled: boolean): Record<string, SecretDoc> {
  const [secrets, setSecrets] = useState<Record<string, SecretDoc>>({});

  useEffect(() => {
    if (!roomCode || !enabled) {
      setSecrets({});
      return;
    }
    const col = collection(db, "rooms", roomCode.toUpperCase().trim(), "secrets");
    return onSnapshot(col, (snap) => {
      const next: Record<string, SecretDoc> = {};
      snap.forEach((d) => {
        next[d.id] = d.data() as SecretDoc;
      });
      setSecrets(next);
    });
  }, [roomCode, enabled]);

  return secrets;
}
