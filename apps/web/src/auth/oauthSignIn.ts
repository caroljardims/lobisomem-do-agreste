/**
 * For future native iOS app, replace web OAuth flow with native Apple Sign-In SDK
 * (Sign in with Apple via AuthenticationServices).
 */
import type { AuthCredential, AuthError, User, UserCredential } from "firebase/auth";
import {
  GoogleAuthProvider,
  OAuthProvider,
  fetchSignInMethodsForEmail,
  linkWithCredential,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { googleProvider } from "../context/AuthContext.js";
import { auth } from "../firebase.js";
import { extractAppleDisplayName } from "./appleProfile.js";
import { ensureUserProfile } from "./ensureUserProfile.js";

export const PASSWORD_LINK_APPLE_MESSAGE =
  "Este e-mail já está cadastrado com senha. Entre com e-mail e senha para vincular sua conta Apple.";

export const PASSWORD_LINK_GOOGLE_MESSAGE =
  "Este e-mail já está cadastrado com senha. Entre com e-mail e senha para vincular sua conta Google.";

export type OAuthFlowOpts = {
  onLinkingStart?: () => void;
};

export function createAppleOAuthProvider(): OAuthProvider {
  const p = new OAuthProvider("apple.com");
  p.addScope("email");
  p.addScope("name");
  return p;
}

function getAccountExistsEmail(err: AuthError): string | undefined {
  const raw = err.customData?.email;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

async function applyAppleDisplayNameIfNeeded(user: User, result: UserCredential): Promise<void> {
  const appleName = extractAppleDisplayName(result);
  if (appleName && !(user.displayName ?? "").trim()) {
    await updateProfile(user, { displayName: appleName.slice(0, 40) });
    await user.reload();
  }
}

/**
 * After `signInWithPopup` / `linkWithCredential`, sync Firestore profile.
 * Pass `credentialResult` when it may contain Apple first-login name.
 */
export async function finalizeOAuthSession(user: User, credentialResult?: UserCredential): Promise<void> {
  if (credentialResult) await applyAppleDisplayNameIfNeeded(user, credentialResult);
  await ensureUserProfile(auth.currentUser ?? user);
}

async function linkPendingCredential(
  email: string,
  pendingCred: AuthCredential,
  attemptedProviderId: "apple.com" | "google.com",
): Promise<void> {
  const methods = await fetchSignInMethodsForEmail(auth, email);
  if (!methods.length) throw new Error("AUTH_GENERIC");

  if (attemptedProviderId === "apple.com" && methods.includes("password")) {
    throw new Error("AUTH_PASSWORD_LINK_APPLE");
  }
  if (attemptedProviderId === "google.com" && methods.includes("password")) {
    throw new Error("AUTH_PASSWORD_LINK_GOOGLE");
  }

  if (attemptedProviderId === "apple.com") {
    if (methods.includes("google.com")) {
      const gResult = await signInWithPopup(auth, googleProvider);
      await linkWithCredential(gResult.user, pendingCred);
      await finalizeOAuthSession(auth.currentUser!);
      return;
    }
    throw new Error("AUTH_GENERIC");
  }

  if (attemptedProviderId === "google.com") {
    if (methods.includes("apple.com")) {
      const ap = createAppleOAuthProvider();
      const aResult = await signInWithPopup(auth, ap);
      await linkWithCredential(aResult.user, pendingCred);
      await finalizeOAuthSession(auth.currentUser!);
      return;
    }
    throw new Error("AUTH_GENERIC");
  }

  throw new Error("AUTH_GENERIC");
}

async function handleAccountExistsWhileSigningIn(
  err: AuthError,
  attemptedProviderId: "apple.com" | "google.com",
  opts?: OAuthFlowOpts,
): Promise<void> {
  opts?.onLinkingStart?.();
  const email = getAccountExistsEmail(err);
  const pendingCred =
    attemptedProviderId === "apple.com"
      ? OAuthProvider.credentialFromError(err)
      : GoogleAuthProvider.credentialFromError(err);
  if (!email || !pendingCred) throw err;
  await linkPendingCredential(email, pendingCred, attemptedProviderId);
}

export async function signInWithAppleFlow(opts?: OAuthFlowOpts): Promise<void> {
  const apple = createAppleOAuthProvider();
  try {
    const result = await signInWithPopup(auth, apple);
    await finalizeOAuthSession(result.user, result);
  } catch (e: unknown) {
    const err = e as AuthError;
    if (err?.code === "auth/account-exists-with-different-credential") {
      await handleAccountExistsWhileSigningIn(err, "apple.com", opts);
      return;
    }
    throw e;
  }
}

export async function signInWithGoogleFlow(opts?: OAuthFlowOpts): Promise<void> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await finalizeOAuthSession(result.user, result);
  } catch (e: unknown) {
    const err = e as AuthError;
    if (err?.code === "auth/account-exists-with-different-credential") {
      await handleAccountExistsWhileSigningIn(err, "google.com", opts);
      return;
    }
    throw e;
  }
}
