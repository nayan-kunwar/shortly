# Stats Endpoint — Dashboard Totals

## What was built

Unnumbered milestone (F5 decision, Option A): `GET /api/v1/stats` →
`{ totalUrls, activeUrls, totalClicks, clicksToday }` from four `COUNT(*)`
queries composed in the service. No params, read rate-limit namespace,
zeroed object on empty DB. Frontend capability map → dashboard EXISTS.
Suite 78/78.

## Why this way

- **Plain counts, no machinery.** Two tables, indexed flags, day-bounded
  click filter — four queries in one `Promise.all`. A rollup table or
  materialized view would be faster at billions of rows and is the
  documented M22 answer; at current volume it would be complexity without
  a measurement behind it.
- **UTC-day "today".** No server locale, no user timezone (no users yet):
  `Date.UTC(y, m, d)` midnight boundary, consistent across instances.
  Timezone-aware "today" waits for authenticated users with preferences.
- **Composition over new repository.** URL counts live in `UrlRepository`,
  click counts in `ClickEventRepository` — the service composes both.
  A dedicated stats repository would own no table and blur the
  one-repo-per-table boundary M1 established.
- **Read namespace, own router file.** Same mount-order exemption pattern
  as M13 (registration before the write-limited router).

## Alternatives considered

- `COUNT(*) OVER ()` window in list query → conflates two endpoints'
  concerns; stats deserve their own cacheable resource.
- Cached stats in Redis (write-through counters) → stale-by-design
  dashboard numbers plus invalidation surface; counts are cheap enough
  direct until proven otherwise.
- Per-day click rollup table → M22 material, not now.

## Trade-offs

- Four round trips per dashboard load (one batch). Trivial cost, honest
  numbers — no cache staleness to explain.
- `COUNT(*)` over `click_events` degrades linearly with table size; the
  trigger for rollups is measured latency, tracked in M21.

## Failure scenarios

- Empty DB → zeros (not 404 — the resource exists, it's empty).
- DB down → 500 (authoritative read, no fallback — M15 posture).

## At 10x scale

Dashboard reads are human-rate; four indexed counts stay sub-millisecond
into the millions of rows. First pressure is full-table `COUNT(*)` at
very large volumes — answered by rollups, then ClickHouse (M22).

## Unblocks

F5 dashboard (quick-create + stats + recents) — its last missing
dependency. F6+ and M14+ proceed independently.
