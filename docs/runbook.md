# Runbook — starting, stopping, and testing Shortly

Nothing here starts anything. Copy-paste as needed.

Working directories matter: backend commands use `pnpm --filter @shortly/api`,
frontend uses `pnpm --filter @shortly/web`. (`dotenv` loads `.env` from the
process working directory — starting the backend elsewhere silently
misconfigures it, typically as auth failures against the wrong PostgreSQL.)

## Infrastructure (repo root)

```bash
cd infrastructure
docker compose up -d postgres redis rabbitmq   # start all three
docker compose ps                              # status
cd .. && pnpm --filter @shortly/api run db:migrate  # apply pending migrations (after up)

cd infrastructure
docker compose stop                            # stop containers, keep data
docker compose down                            # stop + remove containers (volumes kept)
```

If the suite fails with `ECONNREFUSED` or Docker pipe errors, Docker Desktop
itself is down — start it first, then `docker compose up -d`.

## Full Docker stack (repo root)

```bash
cd infrastructure && docker compose up -d      # everything: infra + API replicas + workers + Nginx
docker compose ps                              # all services
docker compose logs -f api                     # follow API logs
docker compose restart api                     # restart one service
docker compose down                            # tear down
```

Services: `postgres`, `redis`, `rabbitmq`, `api` (:3000), `api-2` (:3001),
`worker:publisher`, `worker:analytics`, `nginx` (:8080 → round-robin
across both API replicas).

## Backend API (port 3000)

```bash
pnpm --filter @shortly/api run dev          # watch mode (tsx)
pnpm --filter @shortly/api run build        # TypeScript compilation
pnpm --filter @shortly/api exec node dist/server.js  # production
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

## Workers (one foreground terminal each)

```bash
pnpm --filter @shortly/api run worker:publisher   # outbox → RabbitMQ relay loop
pnpm --filter @shortly/api run worker:analytics   # RabbitMQ → click_events consumer loop
```

Both die on `Ctrl+C`. Do not background them with `&` for demos: orphaned
loops survive their parent shell and silently consume queues. If a queue
drain looks wrong, check `consumerCount` on `analytics.clicks` via the
management UI (`http://localhost:15672`, guest/guest) — anything above 0
with nothing running means a stray.

## Frontend (port 3001)

```bash
pnpm --filter @shortly/web run dev     # Turbopack dev server
pnpm --filter @shortly/web run build   # production build (Turbopack)
pnpm --filter @shortly/web run start   # production serve (after build)
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
cd infrastructure && docker compose up -d   # spins up everything
```

### Option B — Local dev (hot-reload)

1. `cd infrastructure && docker compose up -d postgres redis rabbitmq`
2. `pnpm --filter @shortly/api run db:migrate` (repo root)
3. Backend: `pnpm --filter @shortly/api run dev` (repo root)
4. Workers: `pnpm --filter @shortly/api run worker:publisher` +
   `pnpm --filter @shortly/api run worker:analytics` (own foreground terminals)
5. Frontend: `pnpm --filter @shortly/web run dev` (repo root)

## Full test sweep

```bash
pnpm --filter @shortly/api run test          # backend, 90 tests (needs PG+Redis+RabbitMQ)
pnpm --filter @shortly/web run test          # frontend unit tests
pnpm --filter @shortly/web run test:e2e      # frontend E2E, auto-starts both dev servers
```

## Quality gate (pre-merge)

```bash
pnpm --filter @shortly/api run build        # TypeScript compilation
pnpm --filter @shortly/api run typecheck    # tsc --noEmit
pnpm --filter @shortly/api run lint         # ESLint
pnpm --filter @shortly/api run test         # full backend suite (89/90 — outbox needs RabbitMQ)

pnpm --filter @shortly/web run build        # Next.js production build
pnpm --filter @shortly/web run typecheck    # tsc --noEmit
pnpm --filter @shortly/web run lint         # ESLint
pnpm --filter @shortly/web run test         # frontend tests

pnpm --filter @shortly/shared run build     # shared package build
```

All must pass before merging. Fix branches follow the same gate.
