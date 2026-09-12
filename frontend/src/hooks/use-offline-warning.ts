'use client';

import { useEffect, useState } from 'react';
import { getLastApiSuccess, subscribeApiSuccess } from '../lib/api/api-signal';

/**
 * Whether to show the connectivity warning. Rule: the browser offline
 * signal triggers, but only API failure sustains — any successful response
 * observed *after* the offline signal dismisses it (the signal lies:
 * DevTools throttling leftovers, Brave quirks, mount-time blips).
 * A genuine outage shows the warning because its requests keep failing.
 *
 * Evidence is read from a module timestamp (not only events) so successes
 * that land before this hook mounts are still visible.
 */
export function useOfflineWarning(): boolean {
  const [browserOffline, setBrowserOffline] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine,
  );
  // Starts null ON PURPOSE even when mounting offline: only a real 'offline'
  // event timestamps the signal. Mount state is unconfirmed by design.
  const [offlineSince, setOfflineSince] = useState<number | null>(null);
  // Seed from the module clock: traffic that completed pre-mount counts.
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(() => getLastApiSuccess());

  useEffect(() => {
    const goOnline = (): void => {
      setBrowserOffline(false);
      setOfflineSince(null);
    };
    const goOffline = (): void => {
      setBrowserOffline(true);
      setOfflineSince(Date.now());
    };
    // Event receipt time IS the evidence time (dispatched synchronously
    // inside apiRequest right after the 2xx lands).
    const markSuccess = (): void => setLastSuccessAt(Date.now());
    const unsubscribe = subscribeApiSuccess(markSuccess);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener('shortly:api-success', markSuccess);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('shortly:api-success', markSuccess);
      unsubscribe();
    };
  }, []);

  if (!browserOffline) return false;
  // Mount-time offline (offlineSince null) is unconfirmed: show only when
  // no success predates the mount (genuine offline at load), hide when
  // traffic already flowed (lying signal — the reported user bug).
  if (offlineSince === null) return lastSuccessAt === null;
  return lastSuccessAt === null || lastSuccessAt < offlineSince;
}
