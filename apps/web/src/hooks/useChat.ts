import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase.js";
import type { ChatMessage } from "../types.js";

export function useChat(roomCode: string, dayActive: boolean): ChatMessage[] {
  const [chat, setChat] = useState<ChatMessage[]>([]);
  useEffect(() => {
    if (!roomCode || !dayActive) {
      setChat([]);
      return;
    }
    const q = query(
      collection(db, "rooms", roomCode, "chat"),
      orderBy("createdAt", "asc"),
    );
    return onSnapshot(q, (snap) =>
      setChat(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
  }, [roomCode, dayActive]);
  return chat;
}
