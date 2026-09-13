# Getting Started — Shortly

## Prerequisites

- Node.js 22+
- pnpm 11+
- Docker Desktop (for PostgreSQL, Redis, RabbitMQ)

---

## Quick Start — Local Dev (hot-reload)

### Step 1: Start infrastructure

```bash
cd infrastructure && docker compose up -d postgres redis rabbitmq
```

Wait for healthy:
```bash
docker compose ps
# shortly-postgres   healthy
# shortly-redis      healthy
# shortly-rabbitmq   healthy
```

### Step 2: Install all dependencies

```bash
pnpm install
```

### Step 3: Build shared package

```bash
pnpm --filter @shortly/shared run build
```

### Step 4: Run database migrations

```bash
pnpm --filter @shortly/api run db:migrate
```

### Step 5: Start backend (port 3000)

```bash
pnpm --filter @shortly/api run dev
```

Verify: `curl http://localhost:3000/health`

### Step 6: Start frontend (port 3001)

Create the frontend env file (points to the API):
```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:3000" > apps/web/.env.local
```

Then start:
```bash
pnpm --filter @shortly/web run dev
```

Open: `http://localhost:3001`

> **Note:** `.env.example` defaults to `:8080` (Nginx/Docker). For local dev
> without Nginx, `.env.local` must point to `:3000` (direct API).

### Step 7 (optional): Start workers

```bash
# Terminal A
pnpm --filter @shortly/api run worker:publisher

# Terminal B
pnpm --filter @shortly/api run worker:analytics
```

Workers are needed for analytics click processing. Without them, redirects still work but analytics events won't be published.

---

## Quick Start — Full Docker

One command boots everything (API, API-2, workers, Nginx, infra):

```bash
cd infrastructure && docker compose up -d --build
```

| Service | URL |
|---|---|
| API | http://localhost:3000 |
| Load Balancer (Nginx) | http://localhost:8080 |
| RabbitMQ Management | http://localhost:15672 (guest/guest) |

> The frontend is not included in Docker. Run it locally (Step 6 above).

---

## Testing

### Backend tests

```bash
pnpm --filter @shortly/api run test
# 89/90 pass (outbox test needs RabbitMQ running)
```

### Frontend tests

```bash
pnpm --filter @shortly/web run test
# 40/40
```

### Typecheck

```bash
pnpm --filter @shortly/api run typecheck
pnpm --filter @shortly/web run typecheck
```

### Lint

```bash
pnpm --filter @shortly/api run lint
pnpm --filter @shortly/web run lint
```

### Build (production)

```bash
pnpm --filter @shortly/shared run build
pnpm --filter @shortly/api run build
pnpm --filter @shortly/web run build
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | /health | Health check |
| GET | /ready | Readiness (PG + Redis + RabbitMQ) |
| GET | /metrics | Prometheus metrics |
| GET | /docs.json | OpenAPI 3.0 spec (dev only) |
| GET | /docs | Swagger UI (dev only) |
| POST | /api/v1/urls | Create short URL |
| GET | /api/v1/urls/:code | URL details |
| GET | /api/v1/urls/:code/analytics | Click analytics |
| DELETE | /api/v1/urls/:code | Deactivate URL |
| GET | /:shortCode | Redirect (302) |

---

## Ports

| Port | Service |
|---|---|
| 3000 | Backend API |
| 3001 | Frontend (Next.js) |
| 5433 | PostgreSQL (5432 inside Docker) |
| 6379 | Redis |
| 5672 | RabbitMQ AMQP |
| 15672 | RabbitMQ Management UI |
| 8080 | Nginx Load Balancer |

---

## Troubleshooting

### Port already in use (EADDRINUSE)

Orphaned `node` processes survive terminal closes. Kill them:

```powershell
# PowerShell: find what's using a port
Get-NetTCPConnection -LocalPort 3000,3001 -State Listen |
  Select-Object -ExpandProperty OwningProcess -Unique

# Kill specific PID
taskkill /F /PID <pid>

# Nuclear: kill ALL node processes
taskkill /F /IM node.exe
```

### Docker containers from previous runs

```bash
# See all containers
docker ps -a

# Remove all
docker rm -f $(docker ps -aq)
```

### Stale Docker volumes

```bash
cd infrastructure && docker compose down -v   # removes volumes too
```

---

## Tear Down

```bash
# Stop Docker containers (keeps data)
cd infrastructure && docker compose stop

# Remove everything (data lost)
cd infrastructure && docker compose down
```
