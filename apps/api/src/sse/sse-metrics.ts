/**
 * SSE-specific Prometheus counters.
 * Follows the same pattern as analytics-metrics.ts.
 */

let sseActiveConnectionsGauge = 0;
let sseEventsSentCounter = 0;

/** Simple in-process counters (Prometheus format via http-metrics renderAllMetrics). */
export const sseActiveConnections = {
  inc(): void { sseActiveConnectionsGauge++; },
  dec(): void { sseActiveConnectionsGauge = Math.max(0, sseActiveConnectionsGauge - 1); },
  get value(): number { return sseActiveConnectionsGauge; },
};

export const sseEventsSent = {
  inc(): void { sseEventsSentCounter++; },
  get value(): number { return sseEventsSentCounter; },
};

/** Render SSE metrics in Prometheus text format. */
export function renderSseMetrics(): string {
  return [
    '# HELP sse_active_connections Current number of active SSE connections',
    '# TYPE sse_active_connections gauge',
    `sse_active_connections ${sseActiveConnections.value}`,
    '',
    '# HELP sse_events_sent_total Total number of SSE events sent',
    '# TYPE sse_events_sent_total counter',
    `sse_events_sent_total ${sseEventsSent.value}`,
    '',
  ].join('\n');
}
