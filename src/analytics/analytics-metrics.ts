/**
 * Analytics counters. In-memory per instance (M14 exposes them).
 * `created` counts events emitted on successful redirects; the outbox
 * (M10) and worker (M11) add published/processed/failed counters.
 */
export const analyticsMetrics = {
  eventsCreated: 0,
};

export function recordAnalyticsEventCreated(): void {
  analyticsMetrics.eventsCreated += 1;
}

export function resetAnalyticsMetrics(): void {
  analyticsMetrics.eventsCreated = 0;
}
