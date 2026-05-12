export function BtnSpinner({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="btn-spinner" aria-hidden="true" />;
}
