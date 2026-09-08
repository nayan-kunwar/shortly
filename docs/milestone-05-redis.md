# Milestone 5 — Redis Cache-Aside

## What was built

Read-through cache in front of `resolveUrl`: `url:{shortCode}` entries
(`ioredis`), HIT → answer (+ lazy-expiry recheck), MISS → PostgreSQL →
populate → answer. Negative entries (missing/gone, 60s) blunt hot-key DB
hammering. Mutations invalidate (create/deactivate/update all go through the
service, which owns invalidation). `cache_hits`/`cache_misses` counters
(M14 exposes them). 6 cache tests. Live: 302 cached, 302 in 67ms with Redis
killed, 302 after restart.

## Why this way

- **Cache-aside (lazy), not write-through.** Writes stay single-path (just
  PG + invalidate); the cache fills from real read traffic, so it never
  holds data nobody asks for. Write-through would duplicate every write path
  for zero benefit at our hit rates.
- **Redis is a performance optimization, PG the truth.** Every cache method
  degrades to miss/no-op. The two client options that make this real:
  `enableOfflineQueue:false` (commands never buffer behind dead Redis —
  buffering would hang redirects) and `maxRetriesPerRequest:1` (fail fast
  to the PG fallback). Reconnect backoff stays on for self-healing.
- **Negative caching, short TTL.** A hot unknown key (scanner, typo flood)
  would otherwise become a DB flood. 60s bounds the lie: worst case, a
  created-then-immediately-requested alias waits out... no — create
  _invalidates_, so the only staleness is inherent TTL expiry races. The
  60s is for missing keys that stay missing.
- **Cached rows re-check expiry.** A cached active row can outlive its
  `expiresAt` (cached at T, expires at T+1, TTL until T+3600). The hit path
  applies the same lazy-expiry rules as the DB path — one semantics, two
  sources.
- **`ioredis` over `node-redis`.** Cluster support (M22's Redis Cluster
  stage), mature reconnect/backoff controls, and the fail-fast knobs above.

## Alternatives considered

- Write-through / write-behind → rejected; doubles write complexity, cache
  holds cold data, and write-behind risks loss (Redis isn't the truth).
- CDN in front → future evolution (documented in root spec), wrong layer for
  M5: invalidation and expiry semantics must first be right here.
- In-process (Map) cache → rejected per spec: invisible across N API
  instances (M17), unbounded memory, no shared invalidation.

## Trade-offs

- Extra network hop on MISS (Redis check + PG query). Pays off above trivial
  hit rates; M14 measures the actual ratio before any tuning.
- In-memory counters are per-instance (M14 aggregates across replicas).
- `isActive` flips between invalidate and hit are TTL-bounded races —
  accepted; invalidation makes the window milliseconds, not minutes.

## Failure scenarios (all proven, test + live)

- Redis down → 302 via PG in 67ms (test: broken-port client; live: killed
  container). Fail-open, no hang, no 500.
- Redis back → client self-heals (retryStrategy), hits resume, no restart.
- Stale entry after mutation → impossible via service-owned invalidation;
  tests prove deactivate/create-after-miss re-fetch.
- Every app-using test suite now closes Redis (eager singleton per file
  isolation) — otherwise workers hang on teardown.
- **Test isolation must cover both stores.** Truncating PG while Redis keeps
  entries produced a non-deterministic stale-hit failure (an alias cached by
  an earlier run answered a "miss" assertion). Fix: `FLUSHDB` alongside
  `TRUNCATE` in every cache-reading suite.
- **Fail-fast clients race connection setup.** The first command on a fresh
  client can throw "stream isn't writeable" before `ready`. Fix: gate suites
  on readiness once (`tests/redis-ready.ts`), which also fails loudly with
  an actionable message when Redis is simply down.

## At 10x scale

Redirect QPS (~11.5k avg per M21) splits into hits (sub-ms, Redis) and
misses (PG). First pressure points: Redis memory (TTL × entry size ×
cardinality — M21 sizes it), hot keys on celebrity links (M22: replicas,
then cluster), and PG still serving every miss + write. M14's hit/miss
ratio tells us when to care.

## Before M6

Understand: why fail-fast client options (not try/catch alone) make
fail-open real; why negative TTLs are short; why the service (not callers)
owns invalidation. M6's concurrent alias creation races against the unique
constraint — the cache only observes, never arbitrates.
