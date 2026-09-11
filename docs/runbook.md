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

## Backend API (repo root, port 3000)

```bash
npm run dev          # watch mode (tsx)
node dist/server.js  # production (run `npm run build` first)
```

Health: `curl http://localhost:3000/health`

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

## Kill switches (squatted ports)

```powershell
# PowerShell: kill listeners on 3000/3001
Get-NetTCPConnection -LocalPort 3000,3001 -State Listen |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }
```

Always verify a port is actually free before blaming code for odd responses —
stale servers serving old builds are the most common false alarm.

## Full boot order (when everything is wanted)

1. `docker compose up -d postgres redis rabbitmq` (repo root)
2. `npm run db:migrate` (repo root)
3. Backend: `npm run dev` (repo root)
4. Workers: `npm run worker:publisher` + `npm run worker:analytics`
   (repo root, own foreground terminals)
5. Frontend: `npm run dev` (in `frontend/`)

## Full test sweep

```bash
npm test            # backend, 78 tests (repo root; needs PG+Redis+RabbitMQ)
npm test            # frontend unit, 38 tests (in frontend/)
npm run test:e2e    # frontend E2E, auto-starts both dev servers (in frontend/)
```
