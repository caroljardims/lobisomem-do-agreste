import { signInAnonymously } from "firebase/auth";
import { auth } from "../firebase.js";
import { isLocalDebug } from "../debug/isLocalDebug.js";

/**
 * Ensures a Firebase Auth session exists for localhost debug flows.
 */
export async function ensureDebugAuth(): Promise<void> {
  if (!isLocalDebug()) return;
  if (auth.currentUser) return;
  await signInAnonymously(auth);
}
