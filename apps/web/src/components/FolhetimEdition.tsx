import type { AmanhecerFolhetim } from "../lib/amanhecerContent.js";
import { folhetimEditionNumber } from "../lib/amanhecerContent.js";

export type FolhetimEditionProps = {
  round: number;
  folhetim: AmanhecerFolhetim;
  /** Enquanto o log da madrugada ainda não chegou do Firestore. */
  loading?: boolean;
  className?: string;
};

/** Cartão de jornal — uma única edição da madrugada por rodada (mesmo visual no amanhecer e na praça). */
export function FolhetimEdition({
  round,
  folhetim,
  loading = false,
  className = "",
}: FolhetimEditionProps) {
  const edition = folhetimEditionNumber(round);

  return (
    <article
      className={`folhetim folhetim--edition folhetim--amanhecer folhetim-card${className ? ` ${className}` : ""}`}
      aria-label="Folhetim de Bucaré — edição da madrugada"
    >
      <header className="folhetim-masthead">
        <div className="folhetim-date-row">
          <span>
            Anno {round} · N.º {String(edition).padStart(2, "0")}
          </span>
          <span>Bucaré, Sertão</span>
        </div>
        <h1 className="folhetim-title">Folhetim de Bucaré</h1>
        <p className="folhetim-lead">— edição da madrugada —</p>
      </header>

      <h2 className="folhetim-manchete">{folhetim.manchete}</h2>

      <div className="folhetim-corpo folhetim-corpo-single folhetim-corpo--amanhecer">
        {loading ? (
          <p className="amanhecer-loading muted">A redação compila a edição da madrugada…</p>
        ) : (
          folhetim.paragraphs.map((text, i) => (
            <p key={i} className={i === 0 ? "folhetim-corpo-drop" : undefined}>
              {text}
            </p>
          ))
        )}
      </div>

      <footer className="folhetim-rodape">— o redator que viu —</footer>
    </article>
  );
}
