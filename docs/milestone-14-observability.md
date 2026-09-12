# Milestone 14 — Observability

## What was built

Structured JSON access logs (`requestId`, method, path, status, latency),
per-request UUIDs (`X-Request-Id` echo), hand-rolled Prometheus metrics
(counters + latency histogram + all prior plain counters composed into one
exposition), and `/ready` (dependency-checked, 200/503) beside the
check-free `/health`. Suite 82/82; live labels verified (`path="/health"`,
`path="/:shortCode"`, never raw codes).

## Why this way

- **Liveness vs readiness, separated.** `/health` answers "is the process
  alive" with zero dependency checks (cheap, always 200 when running).
  `/ready` answers "can this instance serve traffic" by probing PG, Redis,
  and RabbitMQ with timeouts. Conflating them makes load balancers route
  traffic to instances whose dependencies are down — or kill healthy
  instances during a dependency blip. M17's Nginx will consume `/ready`.
- **Hand-rolled metrics, no prom-client.** Counters + histograms + text
  exposition total ~100 lines; every byte understood, zero audit surface.
  Graduate if summaries/exemplars are ever needed (they aren't).
- **Hand-rolled JSON logger, no pino.** Same reasoning: one line per event
  on stdout is the whole contract with collectors. Volume or redaction
  needs would justify pino.
- **Route patterns as labels, never raw paths.** `/:shortCode` values as
  Prometheus labels = unbounded cardinality = dead monitoring. The
  middleware reads `req.route.path` at finish time (after routing set it).
- **`/ready`, `/metrics` registered before the redirect router.** Single-
  segment GETs that the catch-all would swallow as short codes — the M4
  ordering invariant, extended.

## Caught live (both fixed)

- **Express 5 stripped `req.path`.** Inside a mounted router the log
  showed `path:"/"` for `/health`. Fix: derive from `originalUrl` (full)
  and mount+pattern (labels). Framework upgrades change small behaviors;
  live verification exists to catch exactly this.
- **Trailing-slash labels** (`/health/` from router-root patterns).
  Normalized — label hygiene is a correctness property for dashboards.

## Alternatives considered

- prom-client / pino → rejected on weight-vs-need (documented graduate paths).
- Per-request child loggers with context propagation (AsyncLocalStorage)
  → the requestId suffices at this depth; ALS when background jobs need
  trace continuity (workers log without request scope today).
- `/ready` without timeouts → a hung dependency hangs the probe and the
  balancer declares death by slowness; 3s caps make failure fast and
  explicit, with per-check error messages (no stacks to clients).

## Trade-offs

- In-memory metrics reset on restart and are per-instance (M17/Nginx must
  scrape every replica; Prometheus federates). Persistence of metrics is
  explicitly not a goal — Prometheus owns history.
- Readiness failure returns 503 with dependency error messages (message
  only). Operators need them; attackers learn dependency topology —
  accepted, `/ready` is infrastructure-facing, not public API.
- Access logs at info per request: volume scales with traffic (~11.5k/s
  per M21 = log pipeline sizing input, sampled logging later if needed).

## Failure scenarios

- Any dependency down → 503 with the failing check named; LB drains the
  instance while `/health` stays 200 (process alive, correctly).
- Metrics endpoint itself is instrumented (self-observation is free).
- Log volume under load is the first cost center — sampling is the
  documented next step, not the current one.

## At 10x scale

Per-request logging + histogram observation cost microseconds against
millisecond handlers. The scaling questions move to collectors (log
pipeline throughput, Prometheus scrape fan-out across replicas) — both
external to this codebase, both measurable from today's output.

## Before M15

Understand: alive-vs-ready, cardinality discipline, fail-fast probes, and
why observability is _load-bearing_ for everything after it (M15 chaos
needs metrics to observe; M17 needs `/ready` to balance). M15 (failure
handling) finally gets to break things on purpose — with instruments on.
