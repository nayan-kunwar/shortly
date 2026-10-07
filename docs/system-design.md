# Shortly — System Design

The whole project in one document. Milestone docs (`docs/milestone-*.md`)
hold the per-decision reasoning; this file is the map over them.

## 1. Functional requirements

| #   | Requirement                                                         | Status                       |
| --- | ------------------------------------------------------------------- | ---------------------------- |
| F1  | Create short URLs (`POST /api/v1/urls`, account or anonymous guest) | M2 + auth + guest flow, live |
| F2  | Redirect (`GET /:shortCode`, 302)                                   | M4, live                     |
| F3  | Custom aliases (validated, reserved, race-safe)                     | M6, live                     |
| F4  | Expiration (`expiresAt`, lazy) + deactivation (`DELETE`, 410)       | M2/M4/M7, live               |
| F5  | List (keyset) + details + global stats reads                        | reads/stats milestones, live |
| F6  | Click analytics pipeline → dashboard API                            | M9–M13, live                 |
| F7  | Distributed rate limiting (100/min/IP, 429)                         | M8, live                     |
| F8  | Observability (logs, metrics, readiness)                            | M14, live                    |
| F9  | Machine-readable API contract                                       | M19, live                    |
| F10 | Horizontal scaling behind a load balancer                           | M17, proven live             |

Accounts are email and password. Sessions are opaque bearer tokens stored as SHA-256 hashes in PostgreSQL, so logout deletes the row and Redis is not required for auth. Management, analytics, and stats are limited to `urls.user_id` of the caller. `GET /:shortCode` stays public and returns only a redirect.

Anonymous creation needs no account: the response mints a `guestId` anchor (stored in the `guests` table, stamped on `urls.guest_id`) that the client sends back as `X-Guest-Token`. Guests get generated codes only — custom aliases return 400. Identity resolution is three-way: no `Authorization` header means guest, a valid bearer means account, and a present-but-invalid bearer is always 401, never silently downgraded to guest. After register/login the client calls `POST /api/v1/urls/claim { guestId }`, which atomically moves only `user_id IS NULL` rows onto the account (idempotent; account-owned rows can never be taken over).

Rows created before accounts have `user_id` NULL _and_ `guest_id` NULL. They keep their short codes and still redirect. They do not appear in any user's list, and delete, details, and analytics answer 404 for them. Nothing in the product assigns those rows to a user.

Out of scope: custom domains, link editing
beyond deactivation (see §7), password reset, and OAuth.

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

## 3. Repository layout

```text
shortly/                        ← pnpm workspace root
├── apps/
│   ├── api/                    ← Express backend (port 3000)
│   │   ├── src/                ← application source
│   │   ├── tests/              ← unit / integration / e2e
│   │   ├── migrations/         ← Drizzle SQL migrations
│   │   └── Dockerfile
│   └── web/                    ← Next.js frontend (port 3001)
│       ├── src/                ← app router, features, components
│       ├── e2e/                ← Playwright
│       └── Dockerfile
├── packages/
│   └── shared/                 ← @shortly/shared (constants, types, validators)
├── infrastructure/
│   ├── docker-compose.yml      ← full stack
│   └── nginx/nginx.conf        ← reverse proxy / LB
├── docs/                       ← milestone docs, runbook, system design
├── pnpm-workspace.yaml
├── tsconfig.base.json          ← shared compiler options
└── .npmrc                      ← node-linker=hoisted
```

### Why a monorepo?

The frontend mirrors contracts it never owns (§5). Keeping API types and
constants in `@shortly/shared` ensures both apps stay in sync without
duplicating validation rules or type definitions. pnpm workspaces give us
atomic installs, workspace-protocol linking (`workspace:*`), and a single
lockfile.

### Key npm scripts

| Action            | Command                                     |
| ----------------- | ------------------------------------------- |
| Install all deps  | `pnpm install`                              |
| Build shared      | `pnpm --filter @shortly/shared run build`   |
| Dev backend       | `pnpm --filter @shortly/api run dev`        |
| Dev frontend      | `pnpm --filter @shortly/web run dev`        |
| Run backend tests | `pnpm --filter @shortly/api run test`       |
| Build frontend    | `pnpm --filter @shortly/web run build`      |
| Full Docker stack | `cd infrastructure && docker compose up -d` |

## 4. Architecture

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

## 5. Data model

- **`urls`** — one row per shortened link. `BIGSERIAL` id (internal;
  random 7-char codes, no longer derived from the id); `short_code` +
  `custom_alias` unique (the redirect and alias indexes); `is_active`
  soft-delete flag; `expires_at` nullable (NULL = forever); `updated_at`
  trigger. `user_id` references `users` and is NULL for anonymous creates
  and pre-account legacy rows. `guest_id` references `guests` and anchors
  anonymous creates until `POST /api/v1/urls/claim` moves them onto an
  account (clearing the anchor).
- **`users`** — email (unique, stored lowercase) and scrypt `password_hash`.
- **`guests`** — opaque anonymous identities (id only); minted on first
  guest create, retired after claim, purged when stale.
- **`sessions`** — `token_hash` unique, `expires_at`. The raw bearer token
  is returned once and never stored.
- **`outbox_events`** — durable publish receipts (`event_id` idempotency
  key, `payload` JSONB, `published_at` NULL = pending, attempt/backoff
  columns, partial index on pending). `docs/milestone-10-outbox.md`.
- **`click_events`** — raw clicks with nullable enrichment columns;
  unique `event_id` (exactly-once effect); `(short_code, clicked_at)`
  index for dashboard reads. 90-day raw retention.
  `docs/milestone-11-analytics-worker.md`, `docs/milestone-12-analytics-storage.md`.

## 6. Request flows

### Creation

```text
Client → Nginx → API → Zod → identity (account or guest anchor) → Service → (alias ? single attempt : random 7-char code with retry) → PG → invalidate → 201 (+ guestId when an anchor was minted)
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
Creates split after identity resolution: accounts share the write budget,
anonymous creates get a strict anti-abuse bucket (10/hour/IP —
`GUEST_CREATE_*`), because guest endpoints mint database rows for
strangers.

## 7. Cross-cutting principles (the project's thesis)

1. Constraints arbitrate, applications translate (uniqueness, races).
2. Caches derive, never originate (fail-open everywhere).
3. Errors carry meaning at the layer with user intent (service rewrites,
   repositories map, edge validates).
4. Laziness is a scalability stance (expiry, cleanup, rollups — all deferred
   to measured need).
5. Mount order, ESM order, and branch order are all load-bearing; when in
   doubt, verify the running artifact, not the source tree (stale `dist`,
   squatter servers, and poisoned dev compiles each burned us once).

## 8. What is not here (and why)

accounts (email + password, scrypt, opaque sessions), custom domains (DNS +
cert complexity for zero learning value now), link editing (deactivate +
recreate covers the lifecycle), ClickHouse/sharding/distributed IDs
(documented futures in M22-stage thinking, unearned at this volume).

## 9. Map to milestone docs

M00 foundation · M01 PostgreSQL · M02 creation · M03 Base62 · M04 redirect ·
M05 Redis · M06 aliases · M07 lifecycle · M08 rate limiting · M09 events ·
M10 outbox · M11 worker · M12 storage · M13 analytics API · M14
observability · M15 failure handling · M16 Docker · M17 load balancer ·
M18 testing · M19 OpenAPI · M21 capacity planning · M22 scaling strategy · M23 architecture review · M24 final README · reads/stats supplements · frontend F0–F9 in
`apps/web/AGENTS.md` + capability map (§30).
