import { useEffect, useMemo, useState } from "react";
import { FolhetimEdition } from "../FolhetimEdition.js";
import type { PrivateLogEntry, PublicLogEntry, RoomDoc } from "../../types.js";
import {
  buildRoundFolhetim,
  filterAmanhecerPublicLog,
} from "../../lib/amanhecerContent.js";

export type AmanhecerScreenProps = {
  room: RoomDoc;
  publicLog: PublicLogEntry[];
  privateLog: PrivateLogEntry[];
  onDismiss: () => void;
};

export function AmanhecerScreen({
  room,
  publicLog,
  privateLog,
  onDismiss,
}: AmanhecerScreenProps) {
  const [showCta, setShowCta] = useState(false);
  const [logWaitDone, setLogWaitDone] = useState(false);
  const round = room.round ?? 1;

  const dawnEntries = useMemo(
    () => filterAmanhecerPublicLog(publicLog, round),
    [publicLog, round],
  );

  const hasNightNews = dawnEntries.some(
    (e) => e.type !== "dawn" || String(e.message ?? "").includes("silêncio"),
  );

  useEffect(() => {
    setShowCta(false);
    setLogWaitDone(false);
    const ctaTimer = window.setTimeout(() => setShowCta(true), 1800);
    const logTimer = window.setTimeout(() => setLogWaitDone(true), 5000);
    return () => {
      window.clearTimeout(ctaTimer);
      window.clearTimeout(logTimer);
    };
  }, [round]);

  useEffect(() => {
    if (hasNightNews) setLogWaitDone(true);
  }, [hasNightNews, round]);

  const privateThisRound = useMemo(
    () => privateLog.filter((e) => e.round === round),
    [privateLog, round],
  );

  const folhetim = useMemo(
    () => buildRoundFolhetim(publicLog, round),
    [publicLog, round],
  );
  const contentReady = logWaitDone || hasNightNews;

  return (
    <div className="screen screen--amanhecer" aria-live="polite">
      <header className="amanhecer-chrome">
        <p className="amanhecer-chrome__label">
          amanhecer · dia {round}
        </p>
        <div className="sol amanhecer-sol" aria-hidden>
          ☀
        </div>
        <p className="eyebrow eyebrow-ocre amanhecer-chrome__tagline">O sol entra na praça</p>
      </header>

      <FolhetimEdition
        round={round}
        folhetim={folhetim}
        loading={!contentReady}
      />

      {privateThisRound.length > 0 && (
        <section className="amanhecer-privado" aria-label="Acontecimentos só para você">
          {privateThisRound.map((e) => (
            <p key={e.id} className="amanhecer-privado__line">
              {e.message}
            </p>
          ))}
        </section>
      )}

      <footer className="amanhecer-footer">
        <button
          type="button"
          className={`btn-dia amanhecer-cta${showCta ? " amanhecer-cta--visible" : ""}`}
          disabled={!showCta}
          onClick={onDismiss}
        >
          Ler na praça →
        </button>
      </footer>
    </div>
  );
}
