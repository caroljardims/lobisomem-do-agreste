import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/** Deve rodar antes de `getFirestore()` — o deploy analisa o módulo antes dos handlers. */
if (!getApps().length) {
  initializeApp();
}

export const db = getFirestore();
