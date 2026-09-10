# Milestone 12 — Analytics Storage

## What was built

Read path on `click_events`: `getStats` (total, per-day buckets, country /
device / browser / referrer breakdowns with `unknown`/`direct` fallbacks),
`purgeClicksOlderThan` retention enforcement (90-day raw policy constant),
and optional enrichment on `recordClick` (NULL until parsing lands).
M13's API reads this; nothing else changes. Suite 67/67.

## Why this way

- **Six small queries, not one mega-query.** Each `GROUP BY` rides
  `idx_click_events_link_time`; the set runs in one `Promise.all` round.
  A single denormalized mega-query would be harder to cache per-panel
  later (M14) and harder to read now. Six indexed aggregations over one
  link's rows are microseconds each.
- **NULLs fold at read time.** `COALESCE(col, 'unknown')` (referrers →
  `'direct'`) keeps storage honest (NULL means unknown) while dashboards
  get display-ready buckets. The rule lives in one helper, not six
  call sites.
- **Retention as a method + constant, not a cron.** `purgeClicksOlderThan`
  exists and is tested; scheduling (cron/scheduler/worker beat) waits for
  operational need. Raw rows 90 days, aggregates timeless — policy beside
  the code it governs.
- **Enrichment columns stay NULL.** Country/device/browser parsing is a
  separate concern (UA parsing, GeoIP data) with its own failure modes;
  the schema reserves the space without pretending the data exists.

## Alternatives considered

- Materialized views / rollup tables → correct at high volume, premature
  now; the read path is six indexed queries, measurable before optimizing.
- One `GROUP BY GROUPING SETS` mega-query → single round trip, but
  monolithic result, harder per-panel caching, worse readability.
- ClickHouse now → the spec's future for good reasons (columnar scans
  over billions), but PostgreSQL aggregates millions of rows per link
  comfortably. Migrate on measured pain (M21 numbers decide).

## Trade-offs

- Six round trips per dashboard load (one `Promise.all` batch). Fine on
  low-latency DB links; a single prepared statement or view if it ever
  profiles hot.
- `sql.raw` for the COALESCE fallback literal: Drizzle re-parameterizes
  each interpolation site ($1 vs $3), which Postgres rejects as different
  GROUP BY expressions. Inlining is safe _only_ because the fallback is a
  code constant — the invariant is commented at the call site.

## Failure scenarios

- Unknown code → zeroed stats object (not 404 — _this_ layer doesn't know
  URLs; M13 decides 404 by checking the urls table first).
- Purge cutoff math is `Date.now`-relative; clock skew shifts retention by
  seconds, irrelevant at day granularity.

## At 10x scale

Per-link aggregation cost grows with _that link's_ clicks, not total
volume — celebrity links are the first hot spots (per-link rollup cache
with short TTL answers that). Table-wide pressure (billions of rows) is
the ClickHouse trigger, quantified in M21.

## Before M13

Understand: read-vs-write path split (M11 wrote, M12 reads), NULL-folding
as display policy, and retention-method-before-scheduler. M13 is a thin
HTTP layer over `getStats`.
