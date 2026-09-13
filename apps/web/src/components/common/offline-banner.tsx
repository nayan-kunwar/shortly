'use client';

import { useOfflineWarning } from '../../hooks/use-offline-warning';

/**
 * Connectivity banner. Shows only when the browser reports offline AND no
 * API success was observed since — observed traffic beats the signal.
 */
export function OfflineBanner() {
  const show = useOfflineWarning();
  if (!show) return null;
  return (
    <p
      role="alert"
      data-testid="offline-banner"
      className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      Connection looks unstable. Shortly actions may fail.
    </p>
  );
}
