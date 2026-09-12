# Milestone 18 — Comprehensive Testing

## What was built

Audit-first milestone: the spec's matrix was ~99% green before writing a
line. The single genuine gap — an automated full-pipeline E2E — now lives
in `tests/e2e/full-pipeline.test.ts`: create → 302 → outbox receipt →
publisher confirms → worker persists → analytics API + metrics assert.
Suite 87/87.

## Coverage audit (the actual deliverable)

| Spec area                                                    | Status                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------- |
| Unit: Base62, validation, expiry, 503 mapping, event builder | ✅ existing                                             |
| Unit: rate limiter, services in isolation                    | ⚠️ via integration (deliberate — needs Redis/DB anyway) |
| Integration: PG, Redis, RabbitMQ, repos, outbox, workers     | ✅ existing                                             |
| E2E: full pipeline                                           | ✅ **built this milestone**                             |
| Expired/deleted/duplicate/concurrent                         | ✅ existing (incl. 10-way race)                         |
| Redis/RabbitMQ failures, 429s, invalid/unknown, PG-down      | ✅ existing + M15 chaos                                 |

## Why this way

- **Audit before code.** Writing tests for covered areas would inflate
  counts without improving confidence. The matrix is the artifact; the
  E2E file is its only delta.
- **Real worker, real broker in E2E.** No mocks below the HTTP boundary:
  the test starts `startAnalyticsWorker` against the actual RabbitMQ and
  asserts on PG rows + API responses. Mocks would test the test.
- **Generous timeouts (60s hooks), not skipped suites.** Infra-dependent
  tests fail loudly when Docker is down (actionable) rather than
  conditionally skipping (silent rot).

## Alternatives considered

- Playwright-style browser E2E for the backend → belongs to the frontend
  track (exists: `frontend/e2e/`). Backend E2E is HTTP-level, where the
  contract lives.
- Coverage-percentage gates → rejected; 100% line coverage with weak
  assertions is theater. The matrix (behavior × failure mode) is the gate.

## Trade-offs

- E2E takes ~2s (broker round trips, worker polling). Acceptable at 87
  tests / ~7s total; quarantining comes only if it flakes (it hasn't).
- No PG-kill automation (container control from inside tests is fragile);
  M15's manual chaos + mapper unit tests cover that cell instead.

## At 10x scale

The suite's cost is developer time (~7s), not system load. Scale pressure
on testing comes from suite _duration_ (parallelize files, ephemeral
databases per worker) — a CI concern for M24, not a code concern now.

## Before M19

Understand: matrix-over-percentage, real-over-mocked at boundaries, and
loud-failures-over-skips. M19 (OpenAPI) documents exactly the contracts
this matrix pins down.
