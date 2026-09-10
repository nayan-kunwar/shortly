# Milestone 13 — Analytics API

## What was built

`GET /api/v1/urls/:shortCode/analytics` → 200 dashboard payload
(`shortCode`, `totalClicks`, `clicksByDay`, `countries`, `devices`,
`browsers`, `referrers`) via a thin service layer over M12's `getStats`;
404 for unknown codes (URL existence checked first). Own rate-limit
namespace (`urls:analytics`), mounted before the write-limited router.
Frontend capability map updated: analytics row → EXISTS. Suite 70/70.

## Why this way

- **Thin by design.** All aggregation logic lives in M12's repository;
  the service adds existence-checking, the controller adds HTTP. Three
  layers, each one idea — the milestone is small because M9–M12 did the
  real work.
- **404 before zeros.** M12 returns zeroed stats for unknown codes (it
  doesn't know URLs); the API checks the urls table first so clients get
  404 for typos, not an empty dashboard that looks broken.
- **Separate rate namespace, separate mount.** A route behind
  `app.use(path, limiter, router)` can never exempt itself — Express
  matches the middleware first. Analytics mounts before the write router
  so dashboards never consume (or get blocked by) the write budget.
  Caught by test, fixed by ordering, commented as invariant.
- **No premature optimization.** Six indexed queries per load; per-panel
  caching and rollups wait for measured pain (M14 ratios, M21 numbers).

## Alternatives considered

- Embedding stats in the URL detail response → couples two lifecycles
  (metadata vs eventually-consistent analytics); separate endpoint,
  separate caching, separate rate budget.
- `POST` for complex filters → GET suffices; no body needed, stays
  cacheable by future CDNs/proxies.
- Returning raw click rows → leaks PII-adjacent detail (IPs, UAs) to
  dashboards; aggregates are the privacy-correct surface.

## Trade-offs

- Eventual consistency is user-visible: a click seconds ago may not
  appear (outbox poll + worker lag). Documented on the response path?
  No — documented here and in F4's loading states, where it belongs.
- No pagination on breakdowns (bounded cardinality: countries, browsers).
  `clicksByDay` grows with link age — pagination if ancient links with
  thousands of days ever matter (they won't).

## Failure scenarios

- Unknown code → 404 (not zeros).
- DB down → 500 via central handler (source of truth unreachable; no
  fallback exists for authoritative reads — M15 records the posture).
- Write budget exhausted → analytics still 200 (namespace separation
  proven by test).

## At 10x scale

Dashboard reads are rare vs redirects (humans, not traffic). Cost per
load is six indexed aggregations over one link's rows. First pressure:
celebrity-link dashboards → short-TTL per-link response cache (M14
metrics identify them). Table-wide pressure → ClickHouse (M22).

## Before M14 / frontend F4

Understand: mount-order-as-exemption, 404-before-zeros, and why the API
is thin. F4 (analytics dashboard) is now unblocked — its only dependency
was this endpoint. M14 (observability) instruments everything built so far.
