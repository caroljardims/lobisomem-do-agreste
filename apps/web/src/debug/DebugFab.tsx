/** Localhost-only floating entry for the debug setup panel. */
type Props = { onClick: () => void };

export function DebugFab({ onClick }: Props) {
  return (
    <button type="button" className="debug-fab" onClick={onClick} aria-label="Abrir painel de debug local">
      ⚙ debug
    </button>
  );
}
