# Milestone 0 — Foundation

## What was built

Minimal Express 5 + TypeScript (strict, ESM/NodeNext) backend with `GET /health`, Zod-validated env, Vitest+Supertest, ESLint flat + Prettier.

## Why this way

- **Express 5.2.1**: required by spec; v5 auto-forwards async errors to the error middleware. Tradeoff: old `'*'` wildcard syntax is gone → we use a bare `app.use()` 404 fallback.
- **ESM (`type: module` + NodeNext)**: modern Node22 default; requires `.js` suffixes on relative TS imports. Alternative was CommonJS (more examples, but legacy).
- **`app.ts` vs `server.ts` split**: `createApp()` is importable/stateless for tests and future horizontal scaling (M17); `server.ts` only binds the port and handles signals.
- **Zod env fail-fast**: invalid `PORT`/`BASE_URL` crashes at boot with a clear message instead of failing mysteriously at runtime.
- **Single app, layered folders**: prepares `Route → Controller → Service → Repository` (M2) without premature microservices.

## Alternatives considered

- `ts-node`/`nodemon` → chose `tsx` (faster, ESM-friendly on Windows).
- `tsc` build only (no bundler) → simplest and debuggable for M0.

## Failure scenarios

- Bad env → boot error (good: fail fast).
- `EADDRINUSE` → clear log + exit 1.
- `SIGTERM/SIGINT` → graceful `server.close()` with 10s force-exit guard.

## At 10x scale

`createApp()` is stateless (only `process.uptime()` is local) so it can run behind Nginx with N replicas. Next bottlenecks: no persistence (M1 Postgres), no cache (M5 Redis), no observability beyond `/health` (M14 adds `/ready`, `/metrics`, request IDs).

## Before M1

Understand: strict TS (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Express 5 error/404 semantics, Supertest pattern (test `createApp()`, not a live port).
