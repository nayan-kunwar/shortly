# Milestone 15 — Failure Handling

## What was built

Explicit failure posture, proven by chaos (not asserted): PG connection
failures map to fast 503s (never 500s, never driver detail); pool
`statement_timeout` bounds hung queries; publisher error backoff gains
jitter; graceful shutdown drains server → pool → Redis. Suite 86/86.

## Chaos proof (live, this milestone)

Postgres stopped mid-run against the real server:

```text
GET  /abc123      → 503 {"error":"ServiceUnavailable"} in 60ms
POST /api/v1/urls → 503 {"error":"ServiceUnavailable"} in 53ms
GET  /health      → 200 (liveness intact during the outage)
GET  /ready       → 503 naming postgres (readiness drains correctly)
```

Redis killed (M5, re-confirmed design): 302 via PG in ~67ms, self-heal on
restart. RabbitMQ down: publisher rejects, backs off, rows wait (M10).

## Why this way

- **503, not 500, for dead dependencies.** 500 claims "our bug" (don't
  retry blindly, page someone); 503 claims "dependency down" (safe to
  retry, safe for load balancers to drain). The distinction is a contract
  with callers and infrastructure, and the mapper is narrow by design:
  connection-level codes only — a `42601` syntax error or `23505`
  conflict must never become a 503.
- **Fail-open vs fail-closed, per dependency.** Redis (cache): open —
  PG answers. RabbitMQ (transport): open at the edge (redirects flow),
  durable behind (outbox waits). PostgreSQL (truth): _cannot_ fail open
  — there is nothing to fall back to, so fail loud and fast with 503.
  The principle: degrade what derives, never what originates.
- **Bounded waits everywhere.** 5s connect, 10s statement, 3s readiness
  probes, fail-fast Redis options. An unbounded wait is a hung request,
  and hung requests are how one slow dependency queues up and kills the
  whole server (cascading failure starts as a queue).
- **Jittered backoff.** Fixed 10s publisher backoff synchronizes replicas
  after a shared outage clears (thundering herd). +0–5s random breaks
  lockstep for one line of code.
- **Drain order on shutdown:** stop accepting → finish in-flight →
  close pool → close Redis. Reverse of boot, the only order that loses
  nothing already accepted.

## Alternatives considered

- Circuit breakers (opossum-style) → correct at multi-dependency scale;
  premature with three deps and existing fail-open paths. Graduate when
  partial degradation needs bulkheading, not before.
- Retry inside request path → rejected for reads/writes (retry storms
  amplify outages); retries live in background workers (publisher,
  outbox claims) where backoff + jitter bound them.
- Hedged requests → latency optimization, not a failure strategy; no.

## Trade-offs

- 503s during PG outages are user-visible errors — unavoidable and
  honest; the alternative (serving stale/wrong data) violates the
  source-of-truth contract.
- Statement timeout (10s) can kill legitimate slow queries (future
  analytics scans) — per-query overrides then, global bound now.
- First chaos run caught a stale server serving pre-mapper code (500s):
  verify-the-binary discipline again — `EADDRINUSE` means your results
  are about the _old_ server.

## Failure scenarios (posture matrix)

```text
PostgreSQL down  → 503 fast (reads + writes), /health 200, /ready 503
Redis down       → 302/201 via PG, slower, self-heals on return
RabbitMQ down    → redirects unaffected, outbox accumulates, publisher retries
App SIGTERM      → drain → close pool/Redis → exit (10s force guard)
Worker SIGTERM   → stop consuming → close channel/connection → exit
```

## At 10x scale

Failure handling doesn't change with scale — but its _absence_ gets more
expensive: retry storms, thundering herds, and cascading queues all scale
superlinearly with traffic. The bulkheads (timeouts, jitter, fail-open
paths, drain order) are already the mechanisms; scale only raises the
stakes for keeping them.

## Before M16

Understand: 503-vs-500 as contract, degrade-derived-never-originated,
bounded waits as cascade prevention, and drain order. M16 (Docker)
packages everything this milestone learned to break on purpose.
