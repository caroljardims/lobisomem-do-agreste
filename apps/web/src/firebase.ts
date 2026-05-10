import { initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

const useEmu = import.meta.env.VITE_USE_EMULATORS === "1";

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "localhost",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "lobisomem-do-sertao",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app: FirebaseApp = initializeApp(cfg);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const fn = getFunctions(app, import.meta.env.VITE_FUNCTIONS_REGION ?? "us-central1");

if (useEmu) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(fn, "127.0.0.1", 5001);
} else if (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) {
  void import("firebase/analytics").then(({ getAnalytics, isSupported }) => {
    isSupported().then((ok) => {
      if (ok) getAnalytics(app);
    });
  });
}

export const call = <T, R>(name: string) => httpsCallable<T, R>(fn, name);
