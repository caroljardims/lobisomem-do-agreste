import { Timestamp } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlayerDoc } from "../types.js";
import { BtnSpinner } from "./BtnSpinner.js";

export type PendingGorro = {
  saciPlayerId: string;
  expiresAt: Timestamp | { seconds: number; nanoseconds?: number } | number;
};

type Props = {
  open: boolean;
  pending: PendingGorro;
  players: PlayerDoc[];
  saciPlayerId: string;
  onSubmit: (targetPlayerId: string) => Promise<void>;
  onExpire: () => Promise<void>;
  busy: boolean;
};

function expiresAtMs(expiresAt: PendingGorro["expiresAt"]): number {
  if (expiresAt instanceof Timestamp) return expiresAt.toMillis();
  if (typeof expiresAt === "number") return expiresAt;
  if (typeof expiresAt === "object" && "seconds" in expiresAt) {
    return expiresAt.seconds * 1000;
  }
  return Date.now();
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function SaciGorroModal({
  open,
  pending,
  players,
  saciPlayerId,
  onSubmit,
  onExpire,
  busy,
}: Props) {
  const [selectedId, setSelectedId] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [expiredFired, setExpiredFired] = useState(false);

  const targets = useMemo(
    () =>
      players.filter(
        (p) =>
          p.id &&
          p.id !== saciPlayerId &&
          p.alive !== false &&
          !p.eliminated &&
          !p.expelled,
      ),
    [players, saciPlayerId],
  );

  /** Ao abrir o modal, libera o disparo único de `onExpire` para este ciclo. */
  useEffect(() => {
    if (!open) return;
    setExpiredFired(false);
  }, [open]);

  /** Firestore atualiza `players` com frequência; preservar alvo escolhido quando ainda for válido. */
  useEffect(() => {
    if (!open) return;
    const allowed = new Set(targets.map((t) => t.id!).filter(Boolean));
    setSelectedId((prev) => {
      if (prev && allowed.has(prev)) return prev;
      return targets[0]?.id ?? "";
    });
  }, [open, targets]);

  useEffect(() => {
    if (!open) return;
    const end = expiresAtMs(pending.expiresAt);
    const tick = () => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0 && !expiredFired) {
        setExpiredFired(true);
        void onExpire();
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [open, pending.expiresAt, expiredFired, onExpire]);

  const handleConfirm = useCallback(() => {
    if (!selectedId || busy || secondsLeft <= 0) return;
    void onSubmit(selectedId);
  }, [selectedId, busy, secondsLeft, onSubmit]);

  if (!open) return null;

  return (
    <div className="saci-gorro-root" role="dialog" aria-modal="true" aria-labelledby="saci-gorro-title">
      <div className="saci-gorro-backdrop" aria-hidden />
      <div className="saci-gorro-card game-card">
        <p className="saci-gorro-timer muted" aria-live="polite">
          {secondsLeft > 0 ? `${secondsLeft}s` : "Redemoinho…"}
        </p>
        <h2 id="saci-gorro-title" className="saci-gorro-title">
          O redemoinho é seu.
        </h2>
        <p className="saci-gorro-lead">
          Escolha quem a cidade vai expulsar no seu lugar.
        </p>
        <ul className="saci-gorro-list">
          {targets.map((p) => {
            const id = p.id!;
            const name = p.name ?? "Jogador";
            const active = selectedId === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`saci-gorro-player${active ? " saci-gorro-player--active" : ""}`}
                  disabled={busy || secondsLeft <= 0}
                  aria-pressed={active}
                  onClick={() => setSelectedId(id)}
                >
                  <span className="saci-gorro-avatar" aria-hidden>
                    {initials(name)}
                  </span>
                  <span className="saci-gorro-name">{name}</span>
                  {active && <span className="saci-gorro-picked">Selecionado</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className="primary-btn saci-gorro-confirm"
          disabled={!selectedId || busy || secondsLeft <= 0}
          onClick={handleConfirm}
        >
          <span className="btn-with-spinner">
            {busy ? "enviando…" : "Jogar no redemoinho"}
            <BtnSpinner show={busy} />
          </span>
        </button>
      </div>
    </div>
  );
}
