/** Status chip. Expired is computed (lazy expiry has no sweep job). */
export function UrlStatusBadge({
  isActive,
  expiresAt,
}: {
  isActive: boolean;
  expiresAt: string | null;
}) {
  // Snapshot render time: correct per render, and keeps this component
  // server-renderable (a ticking clock would force client interactivity
  // for zero benefit — expiry flips on refetch/remount).
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot is the intended semantics
  const now = Date.now();
  const expired = expiresAt !== null && new Date(expiresAt).getTime() <= now;
  const label = !isActive ? 'Inactive' : expired ? 'Expired' : 'Active';
  const tone = label === 'Active' ? 'text-green-700 dark:text-green-400' : 'text-gray-500';
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${tone}`}>
      <span aria-hidden="true">●</span>
      {label}
    </span>
  );
}
