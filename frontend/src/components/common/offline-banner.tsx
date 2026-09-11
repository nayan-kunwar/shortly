'use client';

import { useOnlineStatus } from '../../hooks/use-online-status';

/** Global banner when the browser reports no connectivity. Mutations and
 * queries will fail — say so once, up top, instead of per-form surprises. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <p
      role="alert"
      className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      You are offline. Shortly actions will fail until connectivity returns.
    </p>
  );
}
