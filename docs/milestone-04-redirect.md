# Milestone 4 — Redirect

## What was built

`GET /:shortCode` → 302 + `Location` via `resolveUrl` (service) → single
indexed `findByShortCode`. Unknown → 404 (`NotFoundError`), deactivated →
410 (`GoneError: deactivated`), expired → 410 (`GoneError: expired`). Route
registered after `/health` and `/api/*` with the ordering invariant written
as a code comment. 6 redirect integration tests. Live: `302 Location` and
proper 404 bodies confirmed.

## Why 302 (the status-code analysis)

- **301 (Moved Permanently)** — browsers cache hard, sometimes ignoring later
  server changes. Wrong here three ways: deactivation/expiry would not take
  effect for cached clients, method may be rewritten, and cached redirects
  never hit us — analytics (M9+) would silently undercount.
- **308 (Permanent Redirect)** — same permanence problem, only preserves the
  method. Permanence is the disqualifier, not the method rule.
- **307 (Temporary Redirect)** — correct semantics (temporary, method
  preserved) and arguably the purist pick. Rejected on compatibility: older
  clients/proxies handle 302 more uniformly, and our clients only ever GET,
  so 302's method-rewrite edge (POST→GET) never triggers.
- **302 (Found)** — temporary, universally supported, every click reaches the
  server for counting. Matches the product truth: short links are temporary
  by design (they expire and deactivate).

## Why this shape

- **Expiry is lazy, checked per hit.** No cron, no sweeper, no TTL index yet
  — one comparison in the service. Background cleanup arrives only when row
  volume justifies it (M7/M22).
- **404 vs 410 is a client contract.** 404 = "maybe a typo, retrying could
  work"; 410 = "stop asking, this link is dead." Crawlers and clients treat
  them differently — the distinction is free now, expensive to retrofit.
- **No redirect caching yet.** Every hit goes to Postgres (single indexed
  lookup). M5 adds Redis in front without touching this logic — the service
  signature already returns exactly what a cache would store.
- **Open-redirect safety is inherited.** Only http(s) URLs pass M2
  validation, so `Location` can never be `javascript:` or intranet-targeted
  by a crafted short code.

## Alternatives considered

- 307 instead of 302 → equally defensible; 302 wins on client ubiquity.
- Resolving in the controller (skip the service) → rejected; M5/M9 need the
  same resolve step wrapped with cache and analytics, and that wrapping
  belongs around a service method, not an HTTP handler.
- Separate `GET /r/:code` namespace → rejected; root-level codes are the
  product (short is the point), and the ordering comment contains the risk.

## Trade-offs

- One PG query per redirect — the highest-throughput path with zero caching.
  Correct and measurable; M5 is explicitly the performance milestone.
- `/:shortCode` swallows every unknown single-segment GET (e.g. `/favicon.ico`
  → 404 JSON). Acceptable for an API-first service; a marketing site in front
  would change this.

## Failure scenarios

- Unknown code → 404 JSON (not a redirect to homepage — that would corrupt
  analytics and confuse crawlers).
- Deactivated/expired → 410 with `reason` for programmatic clients.
- DB down → 500 via the central handler (Postgres is the source of truth;
  there is nothing to fall back to yet — Redis fallback arrives in M5/M15).
- Stale background server squatting on :3000 during live checks (happened in
  M4 verification) → kill by owning PID via `Get-NetTCPConnection`, not by
  guessing. Operational hygiene, recorded here so it isn't re-debugged.

## At 10x scale

Redirect QPS dominates (M21: ~11.5k avg, ~58k peak). One indexed B-tree
lookup each — Postgres handles thousands/s on modest hardware, but this path
is why M5 (Redis), M14 (metrics on hit/miss), and M17 (horizontal API)
exist in that order. Nothing in M4 blocks any of them.

## Before M5

Understand: why 302 over 301 (caching × analytics × revocation), why
404≠410, and why the service — not the controller — owns resolve semantics.
M5 puts a cache in front of `resolveUrl` without changing its contract.
