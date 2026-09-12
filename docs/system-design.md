# Shortly — System Design

The whole project in one document. Milestone docs (`docs/milestone-*.md`)
hold the per-decision reasoning; this file is the map over them.

## 1. Functional requirements

| #   | Requirement                                                   | Status                       |
| --- | ------------------------------------------------------------- | ---------------------------- |
| F1  | Create short URLs (`POST /api/v1/urls`)                       | M2, live                     |
| F2  | Redirect (`GET /:shortCode`, 302)                             | M4, live                     |
| F3  | Custom aliases (validated, reserved, race-safe)               | M6, live                     |
| F4  | Expiration (`expiresAt`, lazy) + deactivation (`DELETE`, 410) | M2/M4/M7, live               |
| F5  | List (keyset) + details + global stats reads                  | reads/stats milestones, live |
| F6  | Click analytics pipeline → dashboard API                      | M9–M13, live                 |
| F7  | Distributed rate limiting (100/min/IP, 429)                   | M8, live                     |
| F8  | Observability (logs, metrics, readiness)                      | M14, live                    |
| F9  | Machine-readable API contract                                 | M19, live                    |
| F10 | Horizontal scaling behind a load balancer                     | M17, proven live             |

Out of scope by design: user accounts/auth, custom domains, link editing
beyond deactivation (see §7).

## 2. Non-functional requirements

- **Redirect latency (p99 < 50ms local).** Cache-aside Redis in front of
  one indexed PG lookup; every dependency fails fast, never hangs (M5, M15).
- **Availability over consistency for reads.** Stale cache entries expire
  via TTL; analytics is eventually consistent by design (M9–M11).
- **Durability where it matters.** URLs and outbox rows in PG (source of
  truth); Redis holds only reconstructible derivations (M1, M5, M10).
- **Abuse resistance.** Per-IP budgets (M8), alias rules (M6), validation
  at the edge with constraints at the core (M2).
- **Operability.** Structured logs, Prometheus metrics, liveness vs
  readiness split, containerized everything (M14, M16, M17).
- **Understandability.** The binding constraint on every decision: simple,
  correct, measurable, then scalable (§6).

## 3. Architecture

```text
CLIENT
  │
  ▼
NGINX (:8080) ── round-robin, failover retries
  │                    ┌──────────────┐
  ├─────────┬──────────┤ API replicas │  stateless Express, trust proxy: 1
  │         │          └──────┬───────┘
  │         │                 │
  │         │    ┌────────────┼────────────┐
  │         │    ▼            ▼            ▼
  │         │  Redis       PostgreSQL   RabbitMQ
  │         │  (cache)   (truth+outbox (transport)
  │         │     │        │  +clicks)     │
  │         │     │        │               ▼
  │         │     │        │        ┌──────────────┐
  │         │     │        │        │   Publisher  │  outbox → broker
  │         │     │        │        └──────────────┘
  │         │     │        │        ┌──────────────┐
  │         │     │        │        │   Analytics  │  broker → clicks
  │         │     │        │        │    worker    │  (validate/ack/DLQ)
  │         │     │        │        └──────────────┘
  │         │     │        │
  │         │     │   ┌────┴─────┐
  │         │     │   │ Frontend │  Next.js :3001 (F0–F9)
  │         │     │   └──────────┘
```

Component rationale (one line each): PostgreSQL originates; Redis
accelerates; RabbitMQ decouples; outbox makes async reliable; workers do
background work; Nginx fans out; the API holds no state; the frontend
mirrors contracts it never owns.

## 4. Data model

- **`urls`** — one row per shortened link. `BIGSERIAL` id (internal,
  Base62-encoded for codes); `short_code` + `custom_alias` unique (the
  redirect and alias indexes); `is_active` soft-delete flag; `expires_at`
  nullable (NULL = forever); `updated_at` trigger. No `user_id` FK (no
  users). Full rationale: `docs/milestone-01-postgresql.md`.
- **`outbox_events`** — durable publish receipts (`event_id` idempotency
  key, `payload` JSONB, `published_at` NULL = pending, attempt/backoff
  columns, partial index on pending). `docs/milestone-10-outbox.md`.
- **`click_events`** — raw clicks with nullable enrichment columns;
  unique `event_id` (exactly-once effect); `(short_code, clicked_at)`
  index for dashboard reads. 90-day raw retention.
  `docs/milestone-11-analytics-worker.md`, `docs/milestone-12-analytics-storage.md`.

## 5. Request flows

### Creation

```text
Client → Nginx → API → Zod → Service → (alias ? single attempt : sequence → Base62 in-txn) → PG → invalidate → 201
```

### Redirect (hot path)

```text
Client → Nginx → API → Redis HIT → 302 (+ async click event)
                    └→ MISS → PG → populate → 302 (+ event)
                    └→ Redis down → PG directly (fail-open, M5/M15)
```

### Analytics (async, at-least-once)

```text
Resolve success → url.clicked → outbox row → publisher (confirms) →
RabbitMQ → worker (validate → dedupe insert → ack; poison → DLQ) →
click_events → GET analytics API
```

### Lifecycle / reads / protection

Deactivation flips the flag and invalidates (410 thereafter, M7). List
and stats reads ride the shared read rate budget, mounted before the
write-limited router (registration order is the exemption mechanism).

## 6. Cross-cutting principles (the project's thesis)

1. Constraints arbitrate, applications translate (uniqueness, races).
2. Caches derive, never originate (fail-open everywhere).
3. Errors carry meaning at the layer with user intent (service rewrites,
   repositories map, edge validates).
4. Laziness is a scalability stance (expiry, cleanup, rollups — all deferred
   to measured need).
5. Mount order, ESM order, and branch order are all load-bearing; when in
   doubt, verify the running artifact, not the source tree (stale `dist`,
   squatter servers, and poisoned dev compiles each burned us once).

## 7. What is not here (and why)

Auth (no users, no threat model needing it), custom domains (DNS +
cert complexity for zero learning value now), link editing (deactivate +
recreate covers the lifecycle), ClickHouse/sharding/distributed IDs
(documented futures in M22-stage thinking, unearned at this volume).

## 8. Map to milestone docs

M00 foundation · M01 PostgreSQL · M02 creation · M03 Base62 · M04 redirect ·
M05 Redis · M06 aliases · M07 lifecycle · M08 rate limiting · M09 events ·
M10 outbox · M11 worker · M12 storage · M13 analytics API · M14
observability · M15 failure handling · M16 Docker · M17 load balancer ·
M18 testing · M19 OpenAPI · reads/stats supplements · frontend F0–F9 in
`frontend/AGENTS.md` + capability map (§30).
