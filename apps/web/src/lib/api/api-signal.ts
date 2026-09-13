/**
 * Connectivity evidence bus. apiRequest records every 2xx here; the offline
 * banner reads it. Module-level (not event-only) so evidence observed
 * BEFORE a subscriber mounts is still visible — events are lossy across
 * mount timing, a timestamp is not.
 */
let lastSuccessAt: number | null = null;
const subscribers = new Set<() => void>();

export function recordApiSuccess(): void {
  lastSuccessAt = Date.now();
  for (const notify of subscribers) notify();
}

export function getLastApiSuccess(): number | null {
  return lastSuccessAt;
}

export function subscribeApiSuccess(notify: () => void): () => void {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

/** Test seam: reset between cases. */
export function resetApiSuccess(): void {
  lastSuccessAt = null;
}
