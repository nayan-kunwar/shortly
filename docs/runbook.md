# Runbook — starting, stopping, and testing Shortly

Nothing here starts anything. Copy-paste as needed.

Working directories matter: backend commands run from the repo root,
frontend commands from `frontend/`. (`dotenv` loads `.env` from the process
working directory — starting the backend elsewhere silently misconfigures it,
typically as auth failures against the wrong PostgreSQL.)

## Infrastructure (repo root)

```bash
docker compose up -d postgres redis rabbitmq   # start all three
docker compose ps                              # status
npm run db:migrate                             # apply pending migrations (after up)

docker compose stop                            # stop containers, keep data
docker compose down                            # stop + remove containers (volumes kept)
```

If the suite fails with `ECONNREFUSED` or Docker pipe errors, Docker Desktop
itself is down — start it first, then `docker compose up -d`.

## Full Docker stack (repo root)

```bash
docker compose up -d                           # everything: infra + API replicas + workers + Nginx
docker compose ps                              # all services
docker compose logs -f api                     # follow API logs
docker compose restart api                     # restart one service
docker compose down                            # tear down
```

Services: `postgres`, `redis`, `rabbitmq`, `api` (:3000), `api-2` (:3001),
`worker:publisher`, `worker:analytics`, `nginx` (:8080 → round-robin
across both API replicas).

## Backend API (repo root, port 3000)

```bash
npm run dev          # watch mode (tsx)
node dist/server.js  # production (run `npm run build` first)
```

Health: `curl http://localhost:3000/health`

### Readiness (M14)

```bash
curl http://localhost:3000/ready
```

Returns 200 when PostgreSQL, Redis, and RabbitMQ are reachable; 503 if any
dependency is down. Use this, not health, for traffic decisions.

### Metrics (M14)

```bash
curl http://localhost:3000/metrics
```

Prometheus-format counters and histograms: `http_requests_total`,
`redirect_cache_hits`, `redirect_cache_misses`, `url_creation_total`,
`analytics_events_created`, `analytics_events_published`,
`analytics_events_processed`, `rate_limit_exceeded`.

### OpenAPI docs (M19, dev only)

```bash
curl http://localhost:3000/docs.json   # raw OpenAPI 3.0 JSON
# browser: http://localhost:3000/docs  # Swagger UI explorer
```

Generated from live Zod validators — never hand-edit the spec; change the
validator and the spec follows. Route is mounted only outside production
to avoid `/docs*` collisions with short codes.

## Workers (repo root, one foreground terminal each)

```bash
npm run worker:publisher   # outbox → RabbitMQ relay loop
npm run worker:analytics   # RabbitMQ → click_events consumer loop
```

Both die on `Ctrl+C`. Do not background them with `&` for demos: orphaned
loops survive their parent shell and silently consume queues. If a queue
drain looks wrong, check `consumerCount` on `analytics.clicks` via the
management UI (`http://localhost:15672`, guest/guest) — anything above 0
with nothing running means a stray.

## Frontend (from `frontend/`, port 3001)

```bash
npm run dev     # Turbopack dev server
npm start       # production (run `npm run build` first)
```

## Load balancer (Nginx, port 8080, via Docker)

Rounds across both API replicas (`api` + `api-2`). Use `:8080` instead of
`:3000` to verify load-balanced behaviour (health probes, sessionlessness).

## Kill switches (squatted ports)

```powershell
# PowerShell: kill listeners on 3000, 3001, 8080
Get-NetTCPConnection -LocalPort 3000,3001,8080 -State Listen |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }
```

Always verify a port is actually free before blaming code for odd responses —
stale servers serving old builds are the most common false alarm.

## Full boot order (when everything is wanted)

### Option A — Docker only (simplest)

```bash
docker compose up -d   # repo root, spins up everything
```

### Option B — Local dev (hot-reload)

1. `docker compose up -d postgres redis rabbitmq` (repo root)
2. `npm run db:migrate` (repo root)
3. Backend: `npm run dev` (repo root)
4. Workers: `npm run worker:publisher` + `npm run worker:analytics`
   (repo root, own foreground terminals)
5. Frontend: `npm run dev` (in `frontend/`)

## Full test sweep

```bash
npm test            # backend, 90 tests (repo root; needs PG+Redis+RabbitMQ)
cd frontend && npm test   # frontend unit (in frontend/)
npm run test:e2e    # frontend E2E, auto-starts both dev servers (in frontend/)
```

## Quality gate (pre-merge)

```bash
npm run build       # TypeScript compilation
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npx prettier --check .   # formatting
npm test            # full backend suite (90/90)
```

All five must pass before merging. Fix branches follow the same gate.
