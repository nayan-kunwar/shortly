import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { cacheMetrics } from '../cache/cache-metrics.js';
import { analyticsMetrics } from '../analytics/analytics-metrics.js';
import { rateLimitMetrics as rlMetrics } from '../ratelimit/rate-limit-metrics.js';
import { log } from './logger.js';
import { Counter, Histogram, renderMetrics } from './metrics.js';

export const httpRequestsTotal = new Counter(
  'http_requests_total',
  'HTTP requests by method, path and status.',
  ['method', 'path', 'status'],
);

export const httpRequestDurationSeconds = new Histogram(
  'http_request_duration_seconds',
  'HTTP request latency in seconds.',
  ['method', 'path'],
);

export const redirectRequestsTotal = new Counter('redirect_requests_total', 'Redirects served.');

export const urlCreationTotal = new Counter('url_creation_total', 'Short URLs created.');

/** Full /metrics body: registry counters plus the plain-object modules. */
export function renderAllMetrics(): string {
  const lines = [
    renderMetrics(
      [httpRequestsTotal, redirectRequestsTotal, urlCreationTotal],
      [httpRequestDurationSeconds],
    ).trimEnd(),
  ];
  const plain: [string, string, number][] = [
    ['redirect_cache_hits', 'Redirect cache hits.', cacheMetrics.hits],
    ['redirect_cache_misses', 'Redirect cache misses.', cacheMetrics.misses],
    ['rate_limit_exceeded', 'Rate-limited requests.', rlMetrics.exceeded],
    ['analytics_events_created', 'Click events emitted.', analyticsMetrics.eventsCreated],
    [
      'analytics_events_published',
      'Click events confirmed by the broker.',
      analyticsMetrics.eventsPublished,
    ],
    [
      'analytics_events_processed',
      'Click events persisted by the worker.',
      analyticsMetrics.eventsProcessed,
    ],
    [
      'analytics_events_duplicated',
      'Duplicate deliveries absorbed.',
      analyticsMetrics.eventsDuplicated,
    ],
    ['analytics_events_failed', 'Click events dead-lettered.', analyticsMetrics.eventsFailed],
  ];
  for (const [name, help, value] of plain) {
    lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} counter`, `${name} ${String(value)}`);
  }
  return lines.join('\n') + '\n';
}

/** Reset every metric (tests). Plain modules reset via their own resetters. */
export function resetHttpMetrics(): void {
  httpRequestsTotal.reset();
  redirectRequestsTotal.reset();
  urlCreationTotal.reset();
  httpRequestDurationSeconds.reset();
}

declare module 'express-serve-static-core' {
  // Per-request id for log correlation (X-Request-Id on the wire).
  interface Request {
    id?: string;
  }
}

/** Assign request ids first in the chain (before logging/metrics). */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.id = randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

/**
 * Structured access log + HTTP metrics. Registered early so the `finish`
 * listener attaches to every request; the route pattern is read lazily at
 * finish time (after routing populated it). Raw paths NEVER become labels —
 * `:shortCode` values would explode cardinality.
 *
 * Express 5 subtlety: inside a mounted router, `req.path` stays stripped
 * to the router-relative path (e.g. `/health` logs as `/`), so both the
 * log line and the label derive from `originalUrl` / mount+pattern instead.
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = performance.now();
  res.on('finish', () => {
    const latencyMs = performance.now() - start;
    const pattern = typeof req.route?.path === 'string' ? req.route.path : 'unmatched';
    const rawLabel = `${req.baseUrl}${pattern}`;
    // Normalize '/health/' → '/health' (router root patterns append '/').
    const pathLabel = rawLabel.length > 1 ? rawLabel.replace(/\/$/, '') : rawLabel;
    const fullPath = req.originalUrl.split('?')[0];
    httpRequestsTotal.inc({ method: req.method, path: pathLabel, status: res.statusCode });
    httpRequestDurationSeconds.observe(latencyMs / 1000, { method: req.method, path: pathLabel });
    log('info', 'request', {
      requestId: req.id,
      method: req.method,
      path: fullPath,
      statusCode: res.statusCode,
      latencyMs: Math.round(latencyMs * 10) / 10,
    });
  });
  next();
}
