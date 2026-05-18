import type { AmanhecerFolhetim } from "../lib/amanhecerContent.js";
import { FolhetimEdition } from "./FolhetimEdition.js";

export type FolhetimOverlayProps = {
  open: boolean;
  onClose: () => void;
  round: number;
  folhetim: AmanhecerFolhetim;
};

/** Releitura da mesma edição da madrugada durante o dia. */
export function FolhetimOverlay({
  open,
  onClose,
  round,
  folhetim,
}: FolhetimOverlayProps) {
  if (!open) return null;

  return (
    <div
      className="folhetim-overlay-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Folhetim de Bucaré — edição da madrugada"
      onClick={onClose}
    >
      <div className="folhetim-overlay" onClick={(e) => e.stopPropagation()}>
        <FolhetimEdition round={round} folhetim={folhetim} />
        <button
          type="button"
          className="btn-dia folhetim-overlay__close"
          onClick={onClose}
        >
          ← Voltar à praça
        </button>
      </div>
    </div>
  );
}
