import type { AuthError } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { useCallback, useState } from "react";
import { ensureUserProfile } from "../auth/ensureUserProfile.js";
import {
  PASSWORD_LINK_APPLE_MESSAGE,
  PASSWORD_LINK_GOOGLE_MESSAGE,
  signInWithAppleFlow,
  signInWithGoogleFlow,
} from "../auth/oauthSignIn.js";
import { auth } from "../firebase.js";
import { BtnSpinner } from "./BtnSpinner.js";

function mapAuthError(err: unknown): string {
  const code = err && typeof err === "object" && "code" in err ? String((err as AuthError).code) : "";
  if (code === "auth/wrong-password" || code === "auth/user-not-found" || code === "auth/invalid-credential") {
    return "E-mail ou senha incorretos";
  }
  if (code === "auth/email-already-in-use") {
    return "Este e-mail já está cadastrado";
  }
  return "Algo deu errado. Tente novamente.";
}

function mapAppleFlowError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const m = String((err as { message: string }).message);
    if (m === "AUTH_PASSWORD_LINK_APPLE") return PASSWORD_LINK_APPLE_MESSAGE;
    if (m === "AUTH_PASSWORD_LINK_GOOGLE") return PASSWORD_LINK_GOOGLE_MESSAGE;
    if (m === "AUTH_GENERIC") return "Algo deu errado. Tente novamente.";
  }
  const code = err && typeof err === "object" && "code" in err ? String((err as AuthError).code) : "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return "Login com Apple cancelado.";
  }
  return mapAuthError(err);
}

function mapGoogleFlowError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const m = String((err as { message: string }).message);
    if (m === "AUTH_PASSWORD_LINK_GOOGLE") return PASSWORD_LINK_GOOGLE_MESSAGE;
    if (m === "AUTH_GENERIC") return "Algo deu errado. Tente novamente.";
  }
  return mapAuthError(err);
}

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function AuthModal({ open, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setMode("signin");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setDisplayName("");
    setError(null);
    setPending(null);
  }, []);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const busy = (key: string) => pending === key;

  const onGoogle = async () => {
    setError(null);
    setPending("google");
    try {
      await signInWithGoogleFlow({
        onLinkingStart: () => setPending("linking"),
      });
      resetForm();
      onSuccess();
    } catch (e: unknown) {
      setError(mapGoogleFlowError(e));
    } finally {
      setPending(null);
    }
  };

  const onApple = async () => {
    setError(null);
    setPending("apple");
    try {
      await signInWithAppleFlow({
        onLinkingStart: () => setPending("linking"),
      });
      resetForm();
      onSuccess();
    } catch (e: unknown) {
      setError(mapAppleFlowError(e));
    } finally {
      setPending(null);
    }
  };

  const onEmailSignIn = async () => {
    setError(null);
    setPending("email");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      resetForm();
      onSuccess();
    } catch (e: unknown) {
      setError(mapAuthError(e));
    } finally {
      setPending(null);
    }
  };

  const onRegister = async () => {
    setError(null);
    const name = displayName.trim();
    if (!name) {
      setError("Informe um nome.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setPending("register");
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: name.slice(0, 40) });
      await ensureUserProfile(cred.user);
      resetForm();
      onSuccess();
    } catch (e: unknown) {
      setError(mapAuthError(e));
    } finally {
      setPending(null);
    }
  };

  if (!open) return null;

  return (
    <div className="auth-modal-root" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <button type="button" className="auth-modal-backdrop" aria-label="Fechar" onClick={handleClose} />
      <div className="auth-modal-card">
        <div className="auth-modal-header">
          <h2 id="auth-modal-title" className="auth-modal-title">
            Entrar no Folhetim
          </h2>
          <button type="button" className="auth-modal-x" onClick={handleClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <p className="auth-modal-lead copy-muted">
          Use sua conta para criar ou entrar em uma sala.
        </p>

        {error && <p className="error auth-modal-error">{error}</p>}

        <button
          type="button"
          className="auth-google-btn"
          disabled={pending !== null}
          onClick={() => void onGoogle()}
        >
          <span className="auth-google-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
                fill="#4285F4"
              />
              <path
                d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
                fill="#34A853"
              />
              <path
                d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.348 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"
                fill="#FBBC05"
              />
              <path
                d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"
                fill="#EA4335"
              />
            </svg>
          </span>
          <span className="btn-with-spinner">
            {busy("linking") ? "Vinculando contas…" : busy("google") ? "Conectando…" : "Continuar com Google"}
            <BtnSpinner show={busy("google") || busy("linking")} />
          </span>
        </button>

        <button
          type="button"
          className="auth-apple-btn"
          disabled={pending !== null}
          onClick={() => void onApple()}
        >
          <span className="auth-apple-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 814 1000" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
              <path d="M788.1 834.2c-7.7 17.5-16.6 33.6-26.9 48.3c-14.1 20.1-25.6 33.8-34.5 41.1c-13.6 12.5-28.2 18.9-44.3 19.3c-11.2 0-24.9-3.2-40.8-9.6c-16.1-6.4-30.9-9.5-44.6-9.5c-14.2 0-29.3 3.2-45.4 9.5c-16 6.4-28.9 9.8-38.8 10.2c-15.1.8-30.3-5.7-45.6-19.4c-9.6-8.3-21.6-22.6-35.9-42.9c-15.7-22.3-28.6-48.2-38.8-77.9c-10.8-31.3-16.2-61.6-16.2-91.3c0-33.7 7.3-62.8 22-87.3c11.6-20.0 27.2-35.8 46.9-47.7c19.7-11.9 40.9-18.5 63.6-19.3c12.5-.5 28.8 3.9 48.9 13.1c20.1 9.1 33.1 13.6 39 13.6c8.5 0 22.6-4.3 42.1-12.9c22.5-8.7 41.5-12.3 57-10.9c42.2 3.4 73.9 20.1 95.1 50.1c-37.8 22.9-56.5 55-56.3 96.2c.2 32.1 12 58.8 35.4 79.7c10.5 9.9 22.2 17.6 35.3 23.1c-2.8 8.1-5.8 15.9-9 23.5zM649.3 75.5c0 25.1-9.2 48.5-27.4 69.9c-21.4 24.8-47.4 39.1-75.4 36.8c-.4-2.1-.6-4.3-.6-6.5c0-24.1 10.5-49.9 29.1-71.1c9.3-10.7 21.1-19.6 35.4-26.7c14.2-7.1 27.5-11 39.9-11.4z" />
            </svg>
          </span>
          <span className="btn-with-spinner">
            {busy("linking") ? "Vinculando contas…" : busy("apple") ? "Conectando…" : "Continuar com a Apple"}
            <BtnSpinner show={busy("apple") || busy("linking")} />
          </span>
        </button>

        <div className="auth-modal-divider">
          <span>ou</span>
        </div>

        {mode === "register" && (
          <>
            <label className="field-label" htmlFor="auth-name">
              nome
            </label>
            <input
              id="auth-name"
              className="field-input"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
              placeholder="como quer ser chamado"
            />
          </>
        )}

        <label className="field-label" htmlFor="auth-email">
          e-mail
        </label>
        <input
          id="auth-email"
          className="field-input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="field-label" htmlFor="auth-password">
          senha
        </label>
        <input
          id="auth-password"
          className="field-input"
          type="password"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {mode === "register" && (
          <>
            <label className="field-label" htmlFor="auth-password2">
              confirmar senha
            </label>
            <input
              id="auth-password2"
              className="field-input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </>
        )}

        {mode === "signin" ? (
          <button
            type="button"
            className="primary-btn auth-modal-submit"
            disabled={pending !== null || !email.trim() || !password}
            onClick={() => void onEmailSignIn()}
          >
            <span className="btn-with-spinner">
              {busy("email") ? "Entrando…" : "Entrar"}
              <BtnSpinner show={busy("email")} />
            </span>
          </button>
        ) : (
          <button
            type="button"
            className="primary-btn auth-modal-submit"
            disabled={pending !== null || !email.trim() || !password || !displayName.trim()}
            onClick={() => void onRegister()}
          >
            <span className="btn-with-spinner">
              {busy("register") ? "Criando…" : "Criar conta"}
              <BtnSpinner show={busy("register")} />
            </span>
          </button>
        )}

        <button
          type="button"
          className="auth-modal-switch"
          disabled={pending !== null}
          onClick={() => {
            setError(null);
            setMode((m) => (m === "signin" ? "register" : "signin"));
          }}
        >
          {mode === "signin" ? "Criar conta" : "Já tenho conta — entrar"}
        </button>
      </div>
    </div>
  );
}
