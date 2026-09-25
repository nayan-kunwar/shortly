# Shortly

A production-oriented Bitly-like URL shortening service built as a
system-design learning project. Every architectural decision is documented
in `docs/milestone-*.md` files with rationale, alternatives, trade-offs,
and failure scenarios.

## Features

- **URL shortening** with Base62-encoded codes from PostgreSQL sequences
- **Custom aliases** with reserved-word blocking and race-safe creation
- **Expiration** (lazy expiry via cached timestamps) and **deactivation**
  (soft delete with 410 Gone)
- **Click analytics** pipeline: transactional outbox, RabbitMQ, worker,
  PostgreSQL analytics store
- **Real-time analytics** via Server-Sent Events (SSE) with Redis pub/sub
- **Distributed rate limiting** (100 requests/minute/IP via Redis Lua)
- **Cache-aside Redis** with three-state entries (positive, negative,
  missing) and lazy expiry
- **Load balancing** behind Nginx with passive failure ejection and
  round-robin
- **Observability**: structured JSON logs, Prometheus metrics, liveness vs
  readiness probes, per-request IDs
- **OpenAPI/Swagger** documentation generated from Zod schemas
- **Next.js frontend** with dashboard, URL management, analytics
  dashboards, dark mode, and responsive design

## Architecture

```text
                               CLIENT
                                  │
                                  ▼
                         NGINX (:8080)
                      round-robin, failover
                                  │
                 ┌────────────────┴────────────────┐
                 ▼                                 ▼
            API #1                             API #2
          (Express)                          (Express)
                 │                                 │
                 └─────────────┬───────────────────┘
                               │
               ┌───────────────┼───────────────┐
               ▼               ▼               ▼
            Redis         PostgreSQL       RabbitMQ
           (cache)      (truth + outbox    (transport)
               │          + clicks)            │
               │               │               ▼
               │               │        ┌──────────────┐
               │               │        │  Publisher   │
               │               │        └──────────────┘
               │               │        ┌──────────────┐
               │               │        │  Analytics   │
               │               │        │   Worker     │
               │               │        └──────┬───────┘
               │               │               │
               │               │        redis.publish()
               │               │               │
               │               │        ┌──────▼───────┐
               │               │        │ Redis Pub/Sub │
               │               │        └──────┬───────┘
               │               │               │
               │               │        ┌──────▼───────┐
               │               │        │   SSE        │
               │               │        │ Connection   │
               │               │        │   Manager    │
               │               │        └──────┬───────┘
               │               │               │
               │          ┌────┴─────┐   EventSource
               │          │ Frontend │◄──(real-time)
               │          │ (Next.js)│
               │          └──────────┘
```

PostgreSQL is the source of truth. Redis is a performance optimization.
RabbitMQ decouples redirect latency from analytics processing. The
transactional outbox guarantees at-least-once event delivery without
blocking the redirect path.

## Tech Stack

| Layer           | Technology                            |
| --------------- | ------------------------------------- |
| Runtime         | Node.js 22, TypeScript (strict mode)  |
| API             | Express 5.2.1                         |
| Database        | PostgreSQL 16, Drizzle ORM            |
| Cache           | Redis 7 (ioredis)                     |
| Queue           | RabbitMQ 3 (amqplib)                  |
| Frontend        | Next.js 16, React 19, Tailwind CSS v4 |
| Forms           | React Hook Form + Zod                 |
| Charts          | Recharts                              |
| State           | TanStack Query                        |
| Testing         | Vitest 2, Supertest, Testing Library  |
| Validation      | Zod (shared between API and frontend) |
| Docs            | OpenAPI/Swagger (generated from Zod)  |
| Containers      | Docker, Docker Compose                |
| Load Balancer   | Nginx                                 |
| Package Manager | pnpm 11 (workspaces)                  |

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 11+
- Docker Desktop (for PostgreSQL, Redis, RabbitMQ)

### Local Development (hot-reload)

**1. Start infrastructure**

```bash
cd infrastructure && docker compose up -d postgres redis rabbitmq
```

**2. Install dependencies**

```bash
pnpm install
```

**3. Build shared package**

```bash
pnpm --filter @shortly/shared run build
```

**4. Run database migrations**

```bash
pnpm --filter @shortly/api run db:migrate
```

**5. Start backend (port 3000)**

```bash
pnpm --filter @shortly/api run dev
```

Verify: `curl http://localhost:3000/health`

**6. Start frontend (port 3001)**

```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:3000" > apps/web/.env.local
pnpm --filter @shortly/web run dev
```

Open: `http://localhost:3001`

**7. Start workers (optional, needed for analytics)**

```bash
# Terminal A
pnpm --filter @shortly/api run worker:publisher
# Terminal B
pnpm --filter @shortly/api run worker:analytics
```

### Docker Setup

One command boots everything:

```bash
cd infrastructure && docker compose up -d --build
```

| Service             | URL                                  |
| ------------------- | ------------------------------------ |
| API                 | http://localhost:3000                |
| Load Balancer       | http://localhost:8080                |
| RabbitMQ Management | http://localhost:15672 (guest/guest) |

## Environment Variables

| Variable                  | Default                                               | Description                       |
| ------------------------- | ----------------------------------------------------- | --------------------------------- |
| `DATABASE_URL`            | `postgresql://shortly:shortly@localhost:5433/shortly` | PostgreSQL connection string      |
| `REDIS_URL`               | `redis://localhost:6379`                              | Redis connection string           |
| `RABBITMQ_URL`            | `amqp://guest:guest@localhost:5672`                   | RabbitMQ connection string        |
| `BASE_URL`                | `http://localhost:3000`                               | Public base URL for short links   |
| `PORT`                    | `3000`                                                | API server port                   |
| `REDIS_TTL`               | `3600`                                                | Cache TTL in seconds (60-86400)   |
| `RATE_LIMIT_WINDOW`       | `60`                                                  | Rate limit window in seconds      |
| `RATE_LIMIT_MAX_REQUESTS` | `100`                                                 | Max requests per window per IP    |
| `GUEST_CREATE_WINDOW_SECONDS` | `3600`                                          | Anonymous-create window in seconds |
| `GUEST_CREATE_MAX_REQUESTS` | `10`                                              | Anonymous creates per window per IP |
| `AUTH_SESSION_TTL_SECONDS` | `604800`                                            | Bearer session lifetime (7 days)  |
| `LOG_LEVEL`               | `info`                                                | Log level (debug/info/warn/error) |
| `NODE_ENV`                | `development`                                         | Environment                       |
| `CORS_ORIGIN`             | `http://localhost:3001`                               | Allowed CORS origin               |
| `RUN_WORKERS`             | `false`                                               | Start publisher + analytics worker in same process |

See `apps/api/.env.example` and `apps/web/.env.example` for full lists.

## Database Migrations

```bash
# Run all pending migrations
pnpm --filter @shortly/api run db:migrate
```

Migrations live in `apps/api/migrations/` as hand-written SQL. The Drizzle
schema in `apps/api/src/db/schema.ts` mirrors the migrations for type
safety.

### Tables

| Table           | Purpose                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `urls`          | Shortened link records. `user_id` is the account owner; `guest_id` anchors anonymous creates (NULL once claimed) |
| `users`         | Accounts (`email`, `password_hash`)                                                             |
| `sessions`      | Bearer sessions. Only the SHA-256 of the token is stored                                        |
| `guests`        | Anonymous ownership anchors for guest-created links                                             |
| `outbox_events` | Transactional outbox for reliable event publication (event_id, payload, published_at, attempts) |
| `click_events`  | Raw click analytics (event_id, short_code, country, device_type, browser, referrer, clicked_at) |

## API Documentation

| Method   | Path                                      | Description                                  |
| -------- | ----------------------------------------- | -------------------------------------------- |
| `GET`    | `/`                                       | API info                                     |
| `GET`    | `/health`                                 | Liveness probe (no dependency checks)        |
| `GET`    | `/ready`                                  | Readiness probe (checks PG, Redis, RabbitMQ) |
| `GET`    | `/metrics`                                | Prometheus metrics                           |
| `POST`   | `/api/v1/auth/register`                   | Create an account and session            |
| `POST`   | `/api/v1/auth/login`                      | Start a session                          |
| `POST`   | `/api/v1/auth/logout`                     | Delete the current session               |
| `GET`    | `/api/v1/auth/me`                         | Current user                             |
| `POST`   | `/api/v1/urls`                            | Create short URL (account, or anonymous guest) |
| `POST`   | `/api/v1/urls/claim`                      | Move a guest identity's links onto your account |
| `GET`    | `/api/v1/urls`                            | List URLs (cursor pagination)                |
| `GET`    | `/api/v1/urls/:code`                      | URL details                                  |
| `GET`    | `/api/v1/urls/:code/analytics`            | Click analytics                              |
| `GET`    | `/api/v1/urls/:code/analytics/stream`     | Real-time analytics (SSE)                    |
| `DELETE` | `/api/v1/urls/:code`                      | Deactivate URL                               |
| `GET`    | `/:shortCode`                             | Redirect (302)                               |

### Create URL

Authenticated (Bearer session):

```bash
curl -X POST http://localhost:3000/api/v1/urls \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"url": "https://example.com/very/long/url"}'
```

Response:

```json
{
  "shortCode": "abc123",
  "shortUrl": "http://localhost:3000/abc123",
  "originalUrl": "https://example.com/very/long/url"
}
```

### Guest creates and claim

No token, no account needed — the response mints a `guestId` ownership
anchor (store it; send it back as `X-Guest-Token`). Guests get generated
codes only; custom aliases need an account. A present-but-invalid bearer
is always 401, never silently treated as guest.

```bash
# Create as guest (first call returns a guestId)
curl -X POST http://localhost:3000/api/v1/urls \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/very/long/url"}'

# Later, after register/login — move the guest links onto your account
curl -X POST http://localhost:3000/api/v1/urls/claim \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"guestId": "<guest-id>"}'
```

Claiming is atomic and idempotent: only unclaimed (`user_id IS NULL`)
rows move, so links that already belong to an account can never be taken
over. Anonymous creates share a strict per-IP budget
(`GUEST_CREATE_*`).

### Swagger UI

Available at `http://localhost:3000/docs` during development.

## Testing

```bash
# Backend (89/90 pass — outbox test needs RabbitMQ)
pnpm --filter @shortly/api run test

# Frontend (40/40)
pnpm --filter @shortly/web run test

# Typecheck
pnpm --filter @shortly/api run typecheck
pnpm --filter @shortly/web run typecheck

# Lint
pnpm --filter @shortly/api run lint
pnpm --filter @shortly/web run lint

# Full build
pnpm --filter @shortly/shared run build
pnpm --filter @shortly/api run build
pnpm --filter @shortly/web run build
```

## Analytics

The analytics pipeline uses a **transactional outbox pattern** for
reliable event delivery:

```text
Redirect
   │
   ├──→ User (302 response)
   │
   └──→ Outbox row (same DB transaction)
              │
              ▼
         Publisher (polls, claims with FOR UPDATE SKIP LOCKED)
              │
              ▼
         RabbitMQ (persistent, confirmed)
              │
              ▼
         Analytics Worker (validate, dedupe, insert)
              │
              ▼
         click_events table
              │
              ▼
         GET /api/v1/urls/:code/analytics
```

- **At-least-once delivery** with idempotent consumer (`ON CONFLICT DO NOTHING`)
- **Poison message handling**: first failure requeues, second failure routes to DLQ
- **Fire-and-forget emission**: redirect latency is never blocked by analytics
- **Real-time SSE**: analytics worker publishes to Redis pub/sub after DB
  insert; `SseConnectionManager` fetches aggregated stats from PostgreSQL
  and broadcasts to connected browser clients

## Caching

Cache-aside pattern with Redis:

```text
GET /:shortCode
      │
      ▼
   Redis
      │
   HIT ──→ Return cached mapping
      │
   MISS ──→ PostgreSQL ──→ Populate Redis ──→ Return
```

Three entry types: `url` (positive), `gone` (deactivated/expired),
`missing` (unknown). Negative entries use 60-second TTL to prevent DB
hammering. All cache failures degrade to PostgreSQL (fail-open).

## Rate Limiting

Distributed rate limiting via Redis Lua script:

- **100 requests per minute per IP** on mutating endpoints
- Atomic INCR + conditional EXPIRE prevents race conditions
- Fail-open: Redis errors allow requests through
- Redirects and health endpoints are unlimited
- Returns `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`
  headers

## Observability

### Structured Logging

Every request logs as JSON to stdout:

```json
{
  "requestId": "uuid",
  "method": "POST",
  "path": "/api/v1/urls",
  "statusCode": 201,
  "latencyMs": 45.2
}
```

### Prometheus Metrics

Available at `GET /metrics`:

| Metric                          | Description                      |
| ------------------------------- | -------------------------------- |
| `http_requests_total`           | Requests by method/path/status   |
| `http_request_duration_seconds` | Latency histogram                |
| `redirect_requests_total`       | Total redirects                  |
| `redirect_cache_hits`           | Redis cache hits                 |
| `redirect_cache_misses`         | Redis cache misses               |
| `url_creation_total`            | URLs created                     |
| `analytics_events_created`      | Events written to outbox         |
| `analytics_events_published`    | Events published to RabbitMQ     |
| `analytics_events_processed`    | Events persisted to analytics DB |
| `analytics_events_failed`       | Failed event processing          |
| `rate_limit_exceeded`           | Rate-limited requests            |
| `sse_active_connections`        | Current SSE connections          |
| `sse_events_sent_total`         | Total SSE events sent            |

### Health Probes

- **`GET /health`** — liveness (process alive, no dependency checks)
- **`GET /ready`** — readiness (checks PostgreSQL, Redis, RabbitMQ with
  3-second timeouts)

## Failure Handling

| Failure                | Behavior                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| **Redis down**         | Cache misses fall through to PostgreSQL. Redirects continue. Rate limiter fails open.    |
| **RabbitMQ down**      | Outbox retains events. Publisher retries with exponential backoff. Redirects unaffected. |
| **PostgreSQL down**    | 503 Service Unavailable. Readiness probe marks instance not-ready.                       |
| **API replica killed** | Nginx failover retries on surviving replica. Zero failed requests.                       |
| **Publisher crash**    | Claimed rows become due after backoff. Consumer deduplicates on event_id.                |
| **Poison message**     | First failure: requeue. Second failure: route to dead-letter queue.                      |

## Load Balancing

Nginx round-robin across two stateless API replicas with passive failure
ejection (`max_fails=2`) and `proxy_next_upstream` for in-flight retry.
`trust proxy: 1` ensures accurate client IP detection.

```text
Client → Nginx (:8080) → API #1 (:3000)
                     └→ API #2 (:3000)
```

Proven live: API #1 killed mid-traffic → zero failed requests → API #2
serves all. Restart → healthy rejoin.

## Capacity Planning

Modeled for:

```text
100M new URLs / month
1B redirects / day
```

| Metric            | Value                           |
| ----------------- | ------------------------------- |
| URL creation rate | 38.58/second (average)          |
| Redirect QPS      | 11,574 (average), 57,870 (peak) |
| Read/write ratio  | 300:1                           |
| Analytics events  | 30 billion/month                |
| 90-day storage    | ~50 TB raw click events         |

See `docs/milestone-21-capacity-planning.md` for full calculations.

## Scaling Strategy

Eight-stage evolution from single-node to multi-region, with bottleneck
ordering:

1. **Harden event pipeline** (publisher batching, persistent connections)
2. **Define retention and aggregation** (purge scheduling, rollups)
3. **Separate analytical writes** from transactional URL writes
4. **Add API replicas** from measured per-instance saturation
5. **Add PostgreSQL read replicas** for dashboard queries
6. **Scale Redis** vertically, then cluster on measured pressure
7. **Consider ClickHouse** after retention policy is fixed
8. **Consider sharding** after workload separation and vertical scaling
9. **Consider distributed IDs** for multi-writer creation
10. **Consider multi-region** last

See `docs/milestone-22-scaling-strategy.md` for full analysis.

## System Design

Complete system design document with functional/non-functional
requirements, data model, request flows, and cross-cutting principles:

`docs/system-design.md`

## Trade-offs

| Decision                                  | Trade-off                                                         |
| ----------------------------------------- | ----------------------------------------------------------------- |
| Fire-and-forget outbox emission           | Redirect latency protected, narrow durability gap before commit   |
| Cache-aside with best-effort invalidation | Stale entries persist up to TTL after mutation                    |
| Fixed-window rate limiting                | Simpler than sliding window, allows 2× burst at boundaries        |
| Hand-rolled metrics                       | Small audit surface, but no exemplars/summaries without more work |
| Per-instance metrics                      | No Redis dependency, but requires Prometheus to aggregate         |
| PostgreSQL analytics first                | Simple now, but needs ClickHouse at scale                         |
| Transactional outbox over direct publish  | Reliable delivery, but 3-4× write amplification per click         |

## Known Limitations

- **Legacy unowned links** — rows with `user_id` NULL still redirect and cannot be managed or measured by any account
- **No custom domains** — DNS + cert complexity for zero learning value
- **No link editing** — deactivate + recreate covers the lifecycle
- **Analytics eventually consistent** — pipeline latency from outbox →
  publisher → RabbitMQ → worker → DB
- **Single Nginx** — load balancer is a single point of failure
- **Fixed-window rate limiting** — allows 2× burst at window boundaries

## Future Improvements

See `docs/milestone-23-architecture-review.md` for prioritized fixes:

1. ~~Publisher persistent connection and batch operations~~ (done)
2. ~~Outbox and click retention purge scheduler~~ (done)
3. ~~Micro-batch click inserts in analytics worker~~ (done)
4. ~~Structured logging for all operational error paths~~ (done)
5. ~~Security headers (helmet)~~ (done)
6. ~~Worker metrics exposure~~ (done)
7. DLQ consumer and monitoring
8. ~~Denormalized click counts for `listUrls`~~ (done)
9. ClickHouse for analytics at scale
10. Multi-region deployment

## Project Structure

```text
shortly/                          pnpm workspace root
├── apps/
│   ├── api/                      Express backend (port 3000)
│   │   ├── src/
│   │   │   ├── app.ts            Express app configuration
│   │   │   ├── server.ts         Server entry + graceful shutdown
│   │   │   ├── config/           Environment validation (Zod)
│   │   │   ├── routes/           Route definitions
│   │   │   ├── controllers/      HTTP handlers
│   │   │   ├── services/         Business logic
│   │   │   ├── repositories/     SQL queries (Drizzle)
│   │   │   ├── cache/            Redis cache layer
│   │   │   ├── ratelimit/        Distributed rate limiter
│   │   │   ├── outbox/           Transactional outbox
│   │   │   ├── analytics/        Click event construction
│   │   │   ├── workers/          Publisher + analytics worker
│   │   │   ├── observability/    Logger, metrics, readiness
│   │   │   ├── errors/           Typed error classes
│   │   │   ├── validators/       Zod schemas
│   │   │   └── db/               Drizzle schema + migrations
│   │   └── tests/                Unit, integration, e2e
│   └── web/                      Next.js frontend (port 3001)
│       └── src/
│           ├── app/              App Router pages
│           ├── features/         URL + analytics features
│           ├── components/       UI components
│           └── lib/              API client, query client, utils
├── packages/
│   └── shared/                   @shortly/shared (constants, types)
├── infrastructure/
│   ├── docker-compose.yml        Full stack (8 containers)
│   └── nginx/nginx.conf          Load balancer config
├── docs/                         Milestone docs, system design
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── AGENTS.md                     Master requirements document
```

## Docs

| Document                                   | Description                             |
| ------------------------------------------ | --------------------------------------- |
| `docs/system-design.md`                    | Architecture, data model, request flows |
| `docs/getting-started.md`                  | Setup guide with troubleshooting        |
| `docs/runbook.md`                          | Operational commands                    |
| `docs/milestone-00-foundation.md`          | M0: Project setup                       |
| `docs/milestone-01-postgresql.md`          | M1: Database schema                     |
| `docs/milestone-02-url-creation.md`        | M2: POST /api/v1/urls                   |
| `docs/milestone-03-base62.md`              | M3: Short code encoding                 |
| `docs/milestone-04-redirect.md`            | M4: GET /:shortCode                     |
| `docs/milestone-05-redis.md`               | M5: Cache-aside                         |
| `docs/milestone-06-custom-aliases.md`      | M6: Alias validation                    |
| `docs/milestone-07-url-lifecycle.md`       | M7: Deactivation + expiry               |
| `docs/milestone-08-rate-limiting.md`       | M8: Distributed rate limiter            |
| `docs/milestone-09-analytics-events.md`    | M9: Event construction                  |
| `docs/milestone-10-outbox.md`              | M10: Transactional outbox               |
| `docs/milestone-11-analytics-worker.md`    | M11: Worker + RabbitMQ                  |
| `docs/milestone-12-analytics-storage.md`   | M12: Click events schema                |
| `docs/milestone-13-analytics-api.md`       | M13: Analytics API                      |
| `docs/milestone-14-observability.md`       | M14: Logs, metrics, probes              |
| `docs/milestone-15-failure-handling.md`    | M15: Chaos testing                      |
| `docs/milestone-16-docker.md`              | M16: Containerization                   |
| `docs/milestone-17-loadbalancer.md`        | M17: Nginx + horizontal scaling         |
| `docs/milestone-21-capacity-planning.md`   | M21: Capacity model                     |
| `docs/milestone-22-scaling-strategy.md`    | M22: Scaling stages                     |
| `docs/milestone-23-architecture-review.md` | M23: Final audit                        |
| `docs/click-event-architecture.md`         | Click event pipeline walkthrough         |
| `docs/click-event-architecture.html`       | Interactive HTML architecture guide      |
| `docs/sse-realtime-analytics.md`           | SSE real-time analytics deep dive        |

## License

ISC
