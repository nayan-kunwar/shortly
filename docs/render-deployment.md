# Deployment Guide

Shortly requires **3 processes** to function fully:

| Process | What it does | Required? |
|---|---|---|
| **API Server** | Handles HTTP requests, redirects, URL CRUD | Yes |
| **Publisher Worker** | Reads outbox events, publishes to RabbitMQ | For analytics |
| **Analytics Worker** | Consumes from RabbitMQ, writes click events | For analytics |

Redirects work without the workers, but **clicks won't be counted**.

---

## Option A: Single-Process Mode (Render Free Tier)

Render free tier allows only **1 Web Service**. Use `RUN_WORKERS=true` to run all 3 processes in a single Node.js process.

### How it works

```
Single Node.js Process
├── Express API Server (port $PORT)
├── Publisher Worker (background, fire-and-forget)
└── Analytics Worker (background, graceful stop)
```

### Render configuration

| Setting | Value |
|---|---|
| Start Command | `cd apps/api && npm run db:migrate && node dist/server.js` |
| Build Command | `pnpm install && cd packages/shared && pnpm build && cd ../../apps/api && pnpm build` |
| Environment | `RUN_WORKERS=true` |

### Required environment variables

```bash
NODE_ENV=production
PORT=3000                          # Render sets this automatically
DATABASE_URL=<render-postgres-url> # From Render PostgreSQL service
REDIS_URL=<redis-url>              # From Render Redis service or external
RABBITMQ_URL=<amqp-url>            # From CloudAMQP or similar (Render doesn't offer managed RabbitMQ)
BASE_URL=<your-app-url>
RUN_WORKERS=true                   # ← Key setting: enables combined mode
REDIS_TTL=3600
RATE_LIMIT_WINDOW=60
RATE_LIMIT_MAX_REQUESTS=100
CORS_ORIGIN=<your-frontend-url>
```

### Notes

- The publisher and analytics worker start as background tasks after the API server binds to `$PORT`
- Render's boot timeout is 60s — workers start non-blocking so the server is ready quickly
- On redeploy, SIGTERM gracefully stops the analytics worker (flushes pending batch), then the publisher, then closes connections
- The publisher's outbox pattern ensures no click data is lost on restart — un-published rows are re-delivered

### RabbitMQ on Render

Render doesn't offer managed RabbitMQ. Options:

1. **CloudAMQP** (free "Little Lemur" plan): https://www.cloudamqp.com — 1M messages/month free
2. **Aiven** (free tier): https://aiven.io — 1GB storage free
3. **Self-hosted on a small VM**: If you have another cheap VPS

---

## Option B: Separate Workers (Render Paid Tier or Other Platforms)

If you have multiple dynos/services, run each process separately with `RUN_WORKERS=false`.

### Services to create

| Service | Command | Port |
|---|---|---|
| `api` | `node apps/api/dist/server.js` | 3000 |
| `publisher` | `node apps/api/dist/workers/publisher.js` | none |
| `analytics-worker` | `node apps/api/dist/workers/analytics-worker.js` | none |

### Environment for each

All services share the same `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL`.

| Service | Extra env vars |
|---|---|
| `api` | `RUN_WORKERS=false`, `PORT=3000` |
| `publisher` | None (uses defaults) |
| `analytics-worker` | None (uses defaults) |

### Advantages over single-process

- Independent scaling — add more API dynos without duplicating workers
- Worker crash doesn't affect API availability
- Each worker exposes its own `/metrics` endpoint for Prometheus scraping
- Cleaner resource isolation

---

## Option C: Docker Compose (Self-Hosted)

For self-hosted servers with Docker.

```bash
cd infrastructure
docker compose up -d
```

This runs 5 containers: `api`, `api-2`, `publisher`, `analytics-worker`, `nginx`.

Workers are separate containers with automatic restart. See `infrastructure/docker-compose.yml`.

### Adding the new env var

Add to `infrastructure/docker-compose.yml` under the `api` service:

```yaml
environment:
  RUN_WORKERS: "false"  # Separate containers handle workers
```

---

## Option D: Local Development

```bash
# Terminal 1: API server
cd apps/api
npm run dev

# Terminal 2: Publisher worker
npm run worker:publisher

# Terminal 3: Analytics worker
npm run worker:analytics
```

All default to `RUN_WORKERS=false` — each runs independently.

---

## Upgrading: Free Tier → Paid Tier

When you outgrow the free tier and want separate worker dynos:

### 1. Deploy worker services

Create two new Render services:

**Publisher:**
- Start Command: `cd apps/api && node dist/workers/publisher.js`
- Environment: Same `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL` as the API

**Analytics Worker:**
- Start Command: `cd apps/api && node dist/workers/analytics-worker.js`
- Environment: Same `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL` as the API

### 2. Disable combined mode on the API

Set `RUN_WORKERS=false` on the API service. This stops the API from running background workers.

### 3. Verify

1. Create a short URL via the API
2. Click/visit the short URL
3. Wait a few seconds
4. Check `GET /api/v1/urls/:shortCode/analytics` — clicks should appear

### 4. Monitor

- API metrics: `GET /metrics`
- Publisher metrics: Check the publisher service logs
- Analytics worker metrics: Check the worker service logs
- Outbox backlog: `SELECT COUNT(*) FROM outbox_events WHERE published_at IS NULL` — should stay near 0

---

## Architecture: Click Pipeline

Understanding the data flow helps debug production issues:

```
User clicks short URL
        │
        ▼
  GET /:shortCode
        │
        ▼
  URL Service ──→ Redis cache (HIT → redirect immediately)
        │
        │ MISS
        ▼
  PostgreSQL lookup
        │
        ▼
  OutboxClickEmitter.emit() ──→ INSERT INTO outbox_events
        │                         [fire-and-forget, errors swallowed]
        ▼
  HTTP 302 Redirect ←── User is redirected now
        │
        │ (async, in background)
        ▼
  Publisher Worker (polls outbox every 2s)
        │
        ▼
  RabbitMQ exchange (shortly.events)
        │
        ▼
  Analytics Worker (consumes from queue)
        │
        ▼
  INSERT INTO click_events (ON CONFLICT DO NOTHING)
        │
        ▼
  GET /api/v1/urls/:shortCode/analytics
  GET /api/v1/stats/breakdowns
```

### If clicks aren't being counted

| Symptom | Likely cause | How to check |
|---|---|---|
| `outbox_events` rows with `published_at IS NULL` growing | Publisher not running | `SELECT COUNT(*) FROM outbox_events WHERE published_at IS NULL` |
| `outbox_events` rows have `published_at` but `click_events` is empty | Analytics worker not running | Check worker logs |
| `outbox_events` is empty | Outbox append failing silently | Check API logs for `"Outbox append failed"` |
| `click_events` has rows but breakdowns are empty | Query issue (unlikely) | `SELECT country, COUNT(*) FROM click_events GROUP BY country` |

### Debugging commands

```sql
-- Check outbox backlog (should be 0 or very small)
SELECT COUNT(*) AS pending FROM outbox_events WHERE published_at IS NULL;

-- Check click events
SELECT COUNT(*) AS total_clicks FROM click_events;
SELECT short_code, COUNT(*) AS clicks FROM click_events GROUP BY short_code ORDER BY clicks DESC LIMIT 10;

-- Check recent outbox entries
SELECT id, event_type, event_id, published_at, attempts
FROM outbox_events ORDER BY id DESC LIMIT 5;

-- Check analytics breakdowns
SELECT country, COUNT(*) FROM click_events GROUP BY country ORDER BY count DESC;
SELECT device_type, COUNT(*) FROM click_events GROUP BY device_type ORDER BY count DESC;
```

---

## Environment Variables Reference

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | API server port |
| `DATABASE_URL` | `postgres://shortly:shortly@localhost:5432/shortly` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `REDIS_TTL` | `3600` | Cache TTL in seconds (60–86400) |
| `RABBITMQ_URL` | `amqp://guest:guest@localhost:5672` | RabbitMQ connection string |
| `BASE_URL` | `http://localhost:3000` | Public base URL for short links |
| `NODE_ENV` | `development` | `development`, `test`, or `production` |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `CORS_ORIGIN` | `http://localhost:3001` | Allowed frontend origin |
| `RATE_LIMIT_WINDOW` | `60` | Rate limit window (seconds) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |
| `SSE_POLL_INTERVAL_MS` | `5000` | SSE analytics poll interval |
| `SSE_MAX_CONNECTIONS` | `1000` | Max concurrent SSE connections |
| `SSE_KEEPALIVE_MS` | `20000` | SSE keepalive ping interval |
| `RUN_WORKERS` | `false` | Run publisher + analytics worker in same process |
