/**
 * Analytics counters. In-memory per instance (M14 exposes them).
 * `created` counts events emitted on successful redirects; `published`
 * counts broker-confirmed relays by the publisher (M10); `processed` /
 * `duplicates` / `failed` count worker outcomes (M11).
 */
export const analyticsMetrics = {
  eventsCreated: 0,
  eventsPublished: 0,
  eventsProcessed: 0,
  eventsDuplicated: 0,
  eventsFailed: 0,
};

export function recordAnalyticsEventCreated(): void {
  analyticsMetrics.eventsCreated += 1;
}

export function recordAnalyticsEventPublished(): void {
  analyticsMetrics.eventsPublished += 1;
}

export function recordAnalyticsEventProcessed(): void {
  analyticsMetrics.eventsProcessed += 1;
}

export function recordAnalyticsEventDuplicated(): void {
  analyticsMetrics.eventsDuplicated += 1;
}

export function recordAnalyticsEventFailed(): void {
  analyticsMetrics.eventsFailed += 1;
}

export function resetAnalyticsMetrics(): void {
  analyticsMetrics.eventsCreated = 0;
  analyticsMetrics.eventsPublished = 0;
  analyticsMetrics.eventsProcessed = 0;
  analyticsMetrics.eventsDuplicated = 0;
  analyticsMetrics.eventsFailed = 0;
}
