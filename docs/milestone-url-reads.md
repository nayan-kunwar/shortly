# URL Reads — List & Details Endpoints

## What was built

Unnumbered milestone (spec decision, unblocks F3): `GET /api/v1/urls`
(keyset page: `limit` 1–100, opaque `url:<id>` cursor, substring search,
`{ items, nextCursor }` envelope, per-row lifetime clicks) and
`GET /api/v1/urls/:shortCode` (details + clicks, 404 unknown). Both ride
the read rate-limit namespace. Frontend capability map → EXISTS. Suite 76/76.

## Why this way

- **Keyset, not offset.** `WHERE id < cursor ORDER BY id DESC LIMIT n+1`
  pages in O(page) regardless of table size; `OFFSET` rescans skipped rows
  on every page and duplicates/skips under concurrent inserts. The extra
  row (limit+1) replaces `COUNT(*)` — totals tax every list call on a
  growing table for a number infinite scroll never shows.
- **Opaque cursor.** `base64url("url:<id>")` so clients treat it as a
  token; the encoding can become composite later without a contract break.
  Garbage → 400, not 500.
- **LIKE escaped.** `%`/`_` in search terms are wildcards; unescaped, a
  search for `100%` matches everything. Escape function + literal-match
  test.
- **Clicks via LEFT JOIN + GROUP BY pk.** One query, not N+1; Postgres
  functional dependency lets `GROUP BY urls.id` cover the row.
- **Details compose, don't duplicate.** Row from `UrlRepository`, count
  from `ClickEventRepository` — each repository keeps its table.

## The correlated-subquery bug (caught live, fixed properly)

First version counted clicks with a correlated `sql` subquery. Drizzle
inlines column references inside `sql` fragments **unqualified**, producing
`WHERE "short_code" = "short_code"` — always true, so every row reported
the table total. Tests missed it (no per-row count assertions). Fixed by
switching to the JOIN (no raw SQL at all) and hardening the test to assert
per-row counts (2 vs 0). Lessons: inspect generated SQL (`.toSQL()`) when
counts look suspiciously uniform, and always assert the discriminating
case, not just shapes.

## Alternatives considered

- Offset pagination → rejected (rescan cost + instability under writes).
- Total-count envelope → rejected (per-query `COUNT(*)` tax for an
  unused number).
- Denormalized `click_count` column on urls → correct at high read
  volume (M21), premature now; the JOIN is indexed and pages are ≤100.
- Trigram search (`pg_trgm`) → when substring search over millions
  profiles slow; `ILIKE %q%` is fine today, documented.

## Trade-offs

- Substring `%q%` scans can't use the B-tree (index only helps prefix
  `q%`). Accepted at current volume; trigrams later.
- `nextCursor: null` conflates "empty table" and "last page" — both mean
  "stop paging", so no distinction is needed.

## Failure scenarios

- Bad cursor/limit → 400 field errors (not 500, not empty-200).
- Unknown detail code → 404 (checked against urls, not inferred from
  zero clicks).
- Read budget shared with analytics (one namespace); write exhaustion
  never blocks reads (proven pattern from M13).

## At 10x scale

List cost is O(page) + tiny JOINs — flat. Pressure appears as table
growth (deeper pages still O(page) — keyset's whole point) and search
scans (trigrams). No new bottleneck from this milestone.

## Unblocks

F3 management UI (list/detail/deactivate) — its only missing dependencies
were these two endpoints. F4 was already unblocked by M13.
