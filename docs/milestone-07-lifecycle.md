# Milestone 7 — URL Lifecycle

## What was built

`DELETE /api/v1/urls/:shortCode` → `200 { shortCode, isActive: false }` over
the existing `service.deactivateUrl` (row kept, flag flipped, cache
invalidated). Unknown → 404; repeat delete → 200 (idempotent, same end
state). Redirect after delete → 410. Live: 302 → DELETE → 410.

## Why this way

- **Soft delete, not hard.** Rows are never removed: analytics history
  (M9+) joins against them, audit trails survive, and "undelete" stays
  possible via `updateUrl({ isActive: true })`. Hard deletion would orphan
  click events and destroy evidence — irreversible for zero benefit.
- **Thin milestone, deliberately.** The machinery (flag, 410s, invalidation)
  shipped in M1/M4/M5; M7 only exposes the HTTP surface. Small milestones
  are a feature: the diff is 3 tests + 1 handler, reviewable in minutes.
- **200 + JSON, not 204.** This API answers JSON everywhere; the body
  confirms resulting state (`isActive: false`). 204 saves bytes but forces
  clients to infer — uniformity beats bytes here.
- **Idempotent by end state.** Second delete returns 200 (row exists,
  already inactive) while never-existing returns 404. Same state in, same
  answer out — safe to retry, honest about unknown.
- **Expiry stays lazy.** No sweeper, no cron: `expiresAt` is evaluated on
  read (M4). A background cleanup only earns its existence when dead-row
  volume hurts (measure in M21, build if proven) — plus Redis TTL already
  bounds cached dead entries.

## Alternatives considered

- Hard `DELETE FROM` → rejected (orphans analytics, irreversible).
- `POST /:code/deactivate` RPC-style → rejected; HTTP DELETE is the
  resource lifecycle verb, and the action is idempotent.
- 204 No Content → rejected for API uniformity (see above).
- Scheduled purge job now → premature; lazy expiry + TTLs cover
  correctness, volume doesn't justify a worker yet.

## Trade-offs

- Dead rows accumulate forever (for now). Cost: storage only — reads filter
  on the indexed short_code first, so dead rows don't slow the hot path.
- No "undelete" endpoint yet — the service method exists, the route waits
  for a product need (admin API or user accounts).

## Failure scenarios

- Delete unknown → 404 (not silent 200 — masks typos).
- Delete → immediate 410 even with a hot cache entry (invalidation in the
  service path, proven by pre-populating the test).
- Double delete → 200/200, redirect stays 410. Retry-safe clients.

## At 10x scale

Lifecycle writes are rare (users delete far less than they create). No new
bottleneck. The eventual pressure is table bloat from dead + expired rows —
answered by partitioning/archival (M22), measured first (M21).

## Before M8

Understand: soft-delete as analytics preservation, idempotency-by-end-state,
and why laziness (expiry, cleanup) is a scalability stance, not procrasti-
nation. M8 (rate limiting) guards the write paths this milestone exposed.
