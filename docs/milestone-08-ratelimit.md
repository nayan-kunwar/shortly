# Milestone 8 — Distributed Rate Limiting

## What was built

Fixed-window limiter on the write path (`POST`+`DELETE /api/v1/urls` share
one per-IP budget, default 100/min): Redis `INCR` via an atomic Lua script,
429 + `Retry-After` over budget, `X-RateLimit-*` quota headers under it.
`/health` and redirects are never limited. Live: 201×3 → 429×2 at a limit
of 3, health untouched.

## Why this way

- **Fixed window first.** One `INCR` per request, exact counts, TTL as the
  reset clock — inspectable with `TTL ratelimit:…` in a redis-cli. Sliding
  windows cost ~2× operations for smoothness nobody has yet demanded;
  token buckets add refill math for burst shaping nobody has yet measured.
  Graduate only on measured abuse patterns.
- **Lua, not INCR+EXPIRE.** "Increment, then expire-if-first" is two
  commands — concurrent requests can both see count 1 and both skip
  `EXPIRE`, leaking a key that never resets (a slow memory leak plus a
  permanently-blocked IP). The script makes it atomic; Redis runs scripts
  single-threaded, so no two requests interleave inside it.
- **Redis, not memory.** Process-local counters diverge across N API
  instances (M17) — an attacker gets N× the budget by rotating connections.
  One shared counter per IP is the whole point of "distributed".
- **Fail-OPEN on Redis errors.** Limiting is protection, not correctness:
  failing closed converts a Redis blip into a full write outage. Proven by
  test (broken client still serves) — with the honest caveat that abuse
  protection degrades with Redis (M15 records this posture explicitly).
- **Health/redirects exempt.** 429 on `/health` would make load balancers
  (M17) declare healthy instances dead. 429 on redirects would drop counted
  clicks — the counting path must never shed load by design.

## Alternatives considered

- Sliding-window log (ZADD + ZREMRANGEBYSCORE) → precise, 2–3 ops/req;
  overkill pre-abuse-data.
- Token bucket → best burst control, most moving parts (refill timestamps,
  fractional tokens). Revisit if legitimate bursty clients (mobile sync)
  collide with the fixed window.
- In-memory (Map + setInterval) → rejected: per-instance budgets, lost on
  restart, invisible to operators.
- Fail-closed → rejected (outage amplification, see above).

## Trade-offs

- Fixed-window boundary burst: 100 reqs at :59 + 100 at :01 = 200 in 2s.
  Accepted at 100/min; the Lua shape upgrades to sliding without touching
  call sites if abuse arrives.
- `req.ip` without `trust proxy` is the direct peer — correct locally,
  coarse behind carrier NATs (many users, one budget) and spoofable
  `X-Forwarded-For` is rightly ignored. M17 sets `trust proxy` behind
  Nginx and revisits identification then.
- POST+DELETE share one budget (one namespace, simpler keys). Analytics
  routes get their own namespace in M13.

## Failure scenarios

- Redis down → writes flow unlimited (test + design), counters/log record it.
- Clock skew across API instances → irrelevant: expiry lives on Redis keys
  (single clock), not app servers.
- Key buildup → every key carries a TTL by construction (the Lua invariant).

## At 10x scale

`INCR` throughput is effectively unbounded for this use (Redis does
100k+/s; creation QPS is ~40). No bottleneck from this milestone — the
pressure stays on the redirect path (M5) and future analytics writes.

## Before M9

Understand: atomicity-via-Lua (why two commands aren't one), fail-open as
a deliberate outage trade, and which paths must never 429. M9 (analytics
events) inherits the write-path budget automatically.
