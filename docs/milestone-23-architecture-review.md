# Milestone 23 — Final Architecture Review

## What was built

A comprehensive architecture audit across all subsystems: repository/SQL
layer, Redis cache layer, event pipeline (publisher + analytics worker),
security/validation/error handling, and observability. Each area was
independently reviewed for correctness, failure modes, scalability
bottlenecks, and production readiness.

## What is production-ready

### Transactional Outbox (M10)

The outbox pattern is textbook-correct. The redirect path appends events to
`outbox_events` in the same transaction as the URL write. The publisher
claims rows with `FOR UPDATE SKIP LOCKED`, publishes with confirm channels,
and marks published. The consumer deduplicates on `event_id`. Crash
recovery is automatic: claimed-but-unpublished rows become due again after
the backoff window.

### Cache-Aside (M5)

The cache layer implements lazy population and eager invalidation with a
three-state entry design: positive (`url`), negative (`gone`), and unknown
(`missing`). Negative entries use a 60-second TTL to blunt attack traffic
without polluting the cache. Cached `expiresAt` timestamps are re-checked
at read time (lazy expiry). The entire layer never throws — every Redis
failure degrades to PostgreSQL.

### Rate Limiting (M8)

The rate limiter uses a Redis Lua script for atomic INCR + conditional
EXPIRE, making it truly distributed across all API instances. Fail-open on
Redis errors preserves availability. Rate-limit headers
(`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`) are set on
every response.

### ID Generation (M3)

The PostgreSQL sequence + Base62 encoding produces unique codes without
collisions. The transaction in `createWithGeneratedCode` wraps the INSERT
and UPDATE atomically. Sequence gaps are documented and accepted.

### Input Validation (M2/M6)

All mutating inputs flow through Zod schemas. URL format is validated
(HTTP/HTTPS only, max 2048 chars). Custom aliases are validated for
charset, length, and reserved words. The DB enforces additional constraints
(URL length CHECK, UNIQUE on short_code and custom_alias). LIKE wildcards
are escaped in search queries.

### Error Handling

The central error handler maps typed errors to HTTP status codes: ZodError
→ 400, ConflictError → 409, NotFoundError → 404, GoneError → 410,
ServiceUnavailableError → 503. The `isDatabaseUnavailable` function walks
up to 4 levels of `.cause` to identify PostgreSQL connection failures.

### Privacy (M9)

IPv4 addresses are truncated to /24, IPv6 to /48. Referer query strings
and fragments are stripped. Raw IPs never reach storage. Anonymization
happens at event construction time, before the outbox append.

### Load Balancing (M17)

Two stateless API replicas behind Nginx round-robin with passive failure
ejection and `proxy_next_upstream` for in-flight retry. `trust proxy: 1`
ensures accurate client IP detection.

## What is not production-ready

### 1. Publisher connection lifecycle (HIGH)

**File:** `apps/api/src/workers/publisher.ts:26-57`

Every 2 seconds, the publisher opens a new TCP connection to RabbitMQ,
creates a confirm channel, declares topology, publishes up to 100 messages,
waits for confirms, and closes both channel and connection. This is 30
connect-confirm-close cycles per minute. At scale, this dominates CPU and
network overhead.

**Fix:** Maintain a persistent connection and confirm channel. Reconnect on
error with exponential backoff. Topology assertions are idempotent and
cheap but should not repeat every cycle.

### 2. Per-row database operations in pipeline (MEDIUM)

**Files:**

- `apps/api/src/workers/publisher.ts:45-48` — individual `markPublished`
  per row (100 UPDATEs per batch)
- `apps/api/src/outbox/outbox-repository.ts:84-87` — individual UPDATE per
  claimed row inside the claim transaction
- `apps/api/src/analytics/click-event-repository.ts:41-61` — one INSERT
  per click event in the analytics worker

Each is a round-trip to PostgreSQL. At 100 rows per batch, this is 100
round-trips where one bulk statement would suffice.

**Fix:** Batch `markPublished` into a single `UPDATE ... WHERE id = ANY($1)`.
Batch click inserts into multi-row `INSERT ... VALUES (...), (...)`. Batch
claim updates into a single bulk statement.

### 3. No outbox/click purge scheduler (MEDIUM)

**Files:**

- `apps/api/src/outbox/outbox-repository.ts:102-110` — `purgePublished`
  exists but is never called
- `apps/api/src/analytics/click-event-repository.ts:120-127` —
  `purgeClicksOlderThan` exists but is never called

Published outbox rows and old click events accumulate indefinitely. At M21
scale (30 billion events/month), this is unbounded storage growth.

**Fix:** Add a periodic scheduler (setInterval or cron) that calls both
purge methods. Make the retention window configurable via environment
variables.

### 4. No DLQ consumer or monitoring (MEDIUM)

**File:** `apps/api/src/rabbitmq/connection.ts:7-24`

The dead-letter queue (`analytics.clicks.dlq`) is declared correctly but
no consumer reads from it. Dead-lettered messages accumulate forever. The
`analytics_events_failed` counter is incremented but only visible in the
API process's in-memory metrics — not the worker process.

**Fix:** Add a DLQ consumer that logs/alerts on dead-lettered messages.
Expose worker metrics via a `/metrics` endpoint on each worker process.

### 5. Worker metrics invisible via API `/metrics` (MEDIUM)

**Files:**

- `apps/api/src/workers/publisher.ts` — increments `analytics_events_published`
- `apps/api/src/workers/analytics-worker.ts` — increments `analytics_events_processed`,
  `analytics_events_duplicated`, `analytics_events_failed`

These counters live in the worker processes' memory. The API server's
`/metrics` endpoint reads only its own process's counters. In production,
the analytics pipeline metrics always show zero.

**Fix:** Either expose a `/metrics` endpoint on each worker process (for
Prometheus to scrape separately), or publish metrics to a shared store
(Redis INCRBY, or a Pushgateway).

### 6. Error handler leaks internal messages (MEDIUM)

**File:** `apps/api/src/app.ts:189`

The catch-all 500 handler returns `err.message` verbatim. For unhandled
errors, this can expose internal file paths, database driver messages, or
library internals.

**Fix:** Return a generic `"Internal Server Error"` for the 500 case. Log
the real error server-side.

### 7. No security headers (MEDIUM)

**File:** `apps/api/src/app.ts` (absent)

No `helmet` middleware. Missing `X-Content-Type-Options: nosniff`,
`Strict-Transport-Security`, `X-Frame-Options`. For an API-only service
the risk is lower, but `nosniff` and `HSTS` are valuable even for JSON
APIs.

### 8. Structured logger unused for errors (MEDIUM)

**Files:** 12+ sites across `outbox-emitter.ts`, `rate-limiter.ts`,
`redis/client.ts`, `db/db.ts`, `url.service.ts`, `server.ts`, both workers

All operational error paths use `console.error(...)` with template literal
interpolation. The structured `log()` function exists but is never called
with level `'error'` or `'warn'`. In a log aggregation pipeline (Loki,
CloudWatch, ELK), these produce unstructured lines that cannot be queried
by level or component.

### 9. Worker graceful shutdown (LOW)

**File:** `apps/api/src/workers/analytics-worker.ts:114-122`

`worker.stop()` closes the AMQP channel immediately, then `process.exit(0)`
fires in `.finally()`. In-flight DB writes from message handlers may be
killed before completion. There is no drain period.

### 10. BASE_URL defaults to localhost in production (LOW)

**File:** `apps/api/src/config/env.ts:6`

If `BASE_URL` is not set in production, all generated `shortUrl` values
contain `http://localhost:3000`. The schema should require `BASE_URL` when
`NODE_ENV === 'production'`.

## What assumptions remain

- The M21 capacity model assumes 5× peak factor. Actual peak may be higher
  or lower.
- Redis memory of 300 bytes per cached entry is a nominal estimate.
  Fragmentation, replication, and persistence overhead are additional.
- The publisher batch size of 100 and poll interval of 2 seconds are not
  tuned for any measured throughput. They are reasonable defaults.
- Analytics aggregation (per-day, per-country, per-device) is computed at
  query time. At scale, write-time aggregation into summary tables would be
  more efficient.
- The `listUrls` endpoint uses `LEFT JOIN click_events` to compute click
  counts. This degrades when popular URLs accumulate millions of clicks.

## What would break at 10× scale

```text
10× = 385 creations/s, 115,740 redirects/s, 578,704 peak QPS
```

1. **Publisher throughput.** The connection-per-batch pattern cannot sustain
   115,740 events/second. The outbox accumulates, analytics lag grows, and
   recovery creates a larger redelivery storm.

2. **Click event storage.** 300 billion rows for 90 days. PostgreSQL
   cannot durably ingest 115,740 rows/second while serving redirect cache
   misses and dashboard queries. Global `COUNT(*)` and retention purges
   become operationally severe.

3. **`listUrls` JOIN.** A popular URL with 10M clicks makes the GROUP BY
   scan millions of rows per page query.

4. **`getStats` per-link aggregation.** Six full-scan queries per dashboard
   load for a popular link. At 10M clicks, each query processes 10M rows.

5. **Cache stampede.** A viral short code expiring from Redis triggers
   thousands of simultaneous PostgreSQL lookups. No singleflight dedup
   exists.

## What would break at 100× scale

```text
100× = 3,858 creations/s, 1,157,407 redirects/s, 5,787,037 peak QPS
```

1. **PostgreSQL primary writes.** The outbox append, URL creation, and
   click-event insert all contend for the same primary. Write amplification
   from the outbox (3-4 statements per logical click) makes this worse.

2. **Redis single-instance throughput.** 1.15M redirects/second at peak
   approaches the limits of a single Redis instance, especially with
   hot-key concentration on viral short codes.

3. **Stateless API capacity.** Even at 10,000 redirects/second per
   instance, 579 API replicas are needed. The publisher and analytics
   pipeline remain the binding constraint.

4. **RabbitMQ throughput.** The current broker topology (single exchange,
   single queue) has finite partition throughput. Competing consumers
   improve parallelism but do not eliminate per-message overhead.

## What should be changed next

Priority order, based on the M22 scaling strategy and this audit:

1. **Harden the publisher.** Persistent connection, batch `markPublished`,
   batch claim updates. This is the cheapest fix with the highest impact
   on pipeline throughput.

2. **Add purge schedulers.** Outbox and click retention must run
   periodically. Without them, storage grows without bound.

3. **Micro-batch click inserts.** Accumulate messages in the worker and
   issue multi-row INSERTs. Reduces DB round-trips by 10-50×.

4. **Replace `console.error` with structured logger.** All 12+ operational
   error sites should use `log('error', ...)` for aggregation.

5. **Genericize 500 error messages.** Return `"Internal Server Error"` to
   clients. Log the real error server-side.

6. **Add `helmet` middleware.** Security headers for all responses.

7. **Expose worker metrics.** Either separate `/metrics` endpoints on
   workers, or publish to a shared metric store.

8. **Add DLQ consumer.** Log and alert on dead-lettered messages.

9. **Add missing index on `click_events(clicked_at)`.** Unblocks efficient
   retention cleanup and global stats queries.

10. **Denormalize click counts.** A `click_count` column on `urls`
    eliminates the expensive LEFT JOIN + GROUP BY in `listUrls`.

## Alternatives considered

- Full Prometheus client library (prom-client) → rejected for the same
  weight-vs-need reasoning as M14; hand-rolled metrics suffice.
- pino for structured logging → rejected for the same reason; the current
  `log()` function handles JSON output correctly.
- MongoDB for analytics events → rejected per project constraints;
  PostgreSQL first, ClickHouse later.
- Redis Cluster for cache stampede prevention → premature; singleflight
  or SETNX locking is simpler and sufficient.

## Trade-offs

- Fire-and-forget outbox emission protects redirect latency but accepts a
  narrow durability gap before the outbox row commits.
- Cache-aside with best-effort invalidation means stale entries can persist
  for up to `REDIS_TTL` seconds after a mutation. This is bounded and
  acceptable.
- Per-instance metrics avoid Redis dependency for metric collection but
  require Prometheus to aggregate across replicas.
- Fixed-window rate limiting is simpler than sliding window but allows 2×
  burst at window boundaries.
- Hand-rolled observability keeps the audit surface small but means features
  like exemplars, summary quantiles, and log correlation must be added
  manually.

## Failure scenarios

- **Redis failure:** Cache misses fall through to PostgreSQL. Redirects
  continue. Rate limiter fails open. Readiness probe marks instance
  not-ready (debatable — the instance is functional).
- **RabbitMQ failure:** Outbox retains events. Publisher retries with
  exponential backoff and jitter. Redirect path is unaffected. Analytics
  lag grows until recovery.
- **PostgreSQL failure:** Redirects return 503 (source of truth
  unavailable). URL creation fails. Outbox append fails (fire-and-forget
  drops the event). Readiness probe marks instance not-ready.
- **Publisher crash between confirm and markPublished:** Rows are
  re-claimed and re-published. Consumer deduplicates on `event_id`.
  At-least-once delivery preserved.
- **Analytics worker crash:** Unacked messages are requeued by AMQP.
  `ON CONFLICT DO NOTHING` handles redelivery. DLQ catches poison
  messages after one retry.

## Before M24

Understand:

- The outbox pattern and cache-aside are correct; the publisher relay and
  analytics worker need batching and connection hardening before production
  throughput.
- Purge scheduling is a correctness requirement, not an optimization.
- Worker process metrics are invisible to the API server's `/metrics`
  endpoint — this is an architectural gap that must be addressed.
- The `listUrls` JOIN and `getStats` aggregation are the main query
  performance risks at scale.
- Security hardening (helmet, error message sanitization, structured
  logging) is straightforward but currently missing.
- M24 (final README) should document all known limitations and the
  prioritized fix list from this review.
