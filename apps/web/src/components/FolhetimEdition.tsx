import type { AmanhecerFolhetim } from "../lib/amanhecerContent.js";
import { folhetimEditionNumber } from "../lib/amanhecerContent.js";

export type FolhetimEditionProps = {
  round: number;
  folhetim: AmanhecerFolhetim;
  /** Enquanto o log da madrugada ainda não chegou do Firestore. */
  loading?: boolean;
  className?: string;
  /** Linha abaixo do título. Padrão: edição da madrugada. */
  lead?: string;
  /** Substitui "N.º XX" na data (ex.: "Edição final"). */
  editionLabel?: string;
  ariaLabel?: string;
};

/** Cartão de jornal — uma única edição da madrugada por rodada (mesmo visual no amanhecer e na praça). */
export function FolhetimEdition({
  round,
  folhetim,
  loading = false,
  className = "",
  lead = "— edição da madrugada —",
  editionLabel,
  ariaLabel = "Folhetim de Bucaré — edição da madrugada",
}: FolhetimEditionProps) {
  const edition = folhetimEditionNumber(round);
  const dateEdition =
    editionLabel ?? `N.º ${String(edition).padStart(2, "0")}`;

  return (
    <article
      className={`folhetim folhetim--edition folhetim--amanhecer folhetim-card${className ? ` ${className}` : ""}`}
      aria-label={ariaLabel}
    >
      <header className="folhetim-masthead">
        <div className="folhetim-date-row">
          <span>
            Anno {round} · {dateEdition}
          </span>
          <span>Bucaré, Sertão</span>
        </div>
        <h1 className="folhetim-title">Folhetim de Bucaré</h1>
        <p className="folhetim-lead">{lead}</p>
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
