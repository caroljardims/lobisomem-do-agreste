import type { User } from "firebase/auth";
import { arrayUnion, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase.js";

function providerIdsFromUser(user: User): string[] {
  return [...new Set(user.providerData.map((p) => p.providerId).filter(Boolean))];
}

/** Creates or updates `users/{uid}` from the Auth profile (stats preserved). */
export async function ensureUserProfile(user: User): Promise<void> {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const providerIds = providerIdsFromUser(user);
  const authEmail = user.email ?? "";
  const authPhoto = user.photoURL ?? null;
  const authNameTrim = (user.displayName ?? "").trim();

  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      displayName: authNameTrim || "Jogador",
      email: authEmail,
      photoURL: authPhoto,
      createdAt: serverTimestamp(),
      gamesPlayed: 0,
      gamesWon: 0,
      totalPoints: 0,
      mvpCount: 0,
      podiumCount: 0,
      bestGame: 0,
      favoriteRole: null,
      rolePlayCounts: {},
      providers: providerIds.length ? providerIds : ["password"],
      isPremium: false,
      premiumSince: null,
      stripeCustomerId: null,
      favorites: [],
    });
    return;
  }

  const existing = snap.data() as Record<string, unknown>;
  const updates: Record<string, unknown> = {
    uid: user.uid,
    email: authEmail,
    photoURL: authPhoto,
  };

  if (authNameTrim) {
    updates.displayName = authNameTrim;
  }

  if (providerIds.length) {
    updates.providers = arrayUnion(...providerIds);
  }

  if (existing.favorites === undefined) updates.favorites = [];
  if (existing.isPremium === undefined) updates.isPremium = false;
  if (existing.totalPoints === undefined) updates.totalPoints = 0;
  if (existing.mvpCount === undefined) updates.mvpCount = 0;
  if (existing.podiumCount === undefined) updates.podiumCount = 0;
  if (existing.bestGame === undefined) updates.bestGame = 0;
  if (existing.premiumSince === undefined) updates.premiumSince = null;
  if (existing.stripeCustomerId === undefined) updates.stripeCustomerId = null;
  if (existing.rolePlayCounts === undefined) updates.rolePlayCounts = {};

  await updateDoc(ref, updates);
}
