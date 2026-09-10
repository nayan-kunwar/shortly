/**
 * Analytics counters. In-memory per instance (M14 exposes them).
 * `created` counts events emitted on successful redirects; `published`
 * counts broker-confirmed relays by the publisher (M10); the worker (M11)
 * adds processed/failed counters.
 */
export const analyticsMetrics = {
  eventsCreated: 0,
  eventsPublished: 0,
};

export function recordAnalyticsEventCreated(): void {
  analyticsMetrics.eventsCreated += 1;
}

export function recordAnalyticsEventPublished(): void {
  analyticsMetrics.eventsPublished += 1;
}

export function resetAnalyticsMetrics(): void {
  analyticsMetrics.eventsCreated = 0;
  analyticsMetrics.eventsPublished = 0;
}
