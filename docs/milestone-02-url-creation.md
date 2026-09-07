# Milestone 2 — URL Creation API

## What was built

`POST /api/v1/urls` → `201 { shortCode, shortUrl, originalUrl }`, layered as
Route → Controller → Service → Repository → PostgreSQL. Zod validation
(http/https only, 2048 max, future `expiresAt`, basic alias sanity);
central error mapping (ZodError → 400, ConflictError → 409). Interim
random-Base62 code generator with retry-on-collision, isolated in
`src/utils/short-code.ts` for M3 to replace. 6 API integration tests.

## Why this way

- **Layered, not clever.** Route parses nothing, controller does HTTP only,
  service owns the creation policy (alias vs generated, retry loop),
  repository owns SQL. Each layer is independently testable; M5 (Redis) slots
  into the service without touching HTTP or SQL.
- **Validation at the edge, constraints at the core.** Zod rejects garbage
  fast with good messages; the DB unique constraint still owns correctness
  (M1 principle, unchanged).
- **201, not 200.** POST created a resource — status codes are API contract,
  and clients/observability (M14) distinguish creations from reads by them.
- **Composition root in `app.ts`.** Wiring lives in one place; handlers take
  dependencies as arguments, so tests build the real stack against a test DB
  with no mocks.
- **Interim random codes, honestly labeled.** M3 (Base62 over sequence ids)
  comes next in the spec order, so M2 generates random 7-char codes with a
  5-attempt retry loop. The retry exists because random codes _can_ collide —
  that lesson is the entire point of M3, previewed here rather than hidden.

## Alternatives considered

- NanoID library → rejected; `node:crypto` does the same in 8 lines with no
  dependency, and the generator is throwaway code M3 deletes.
- Validating in middleware vs controller → controller keeps one file per
  concern; middleware pays off with >1 route sharing a schema (later).
- 200 vs 201 → 201; see above.
- Storing alias separately from short_code → kept as one value for M2 (the
  redirect in M4 looks up one column); M6 revisits alias semantics properly.

## Trade-offs

- Alias rules are intentionally thin (length + charset). Reserved words and
  hardening belong to M6 — M2 refuses to swallow M6's milestone.
- `MAX_CODE_ATTEMPTS = 5` can theoretically exhaust (then 500). At 62^7
  combinations vs our volume the probability is negligible; M3 removes the
  loop by construction.

## Failure scenarios (test-caught, both fixed)

1. **Ambiguous constraint.** Alias stored as short_code means a duplicate
   alias trips _either_ unique constraint and Postgres reports one at random.
   Fix: the service rewrites any alias-path conflict to `customAlias` — the
   layer that knows user intent owns the error's meaning, not the DB.
2. **Parallel test files + shared DB.** Two suites TRUNCATE-ing one database
   flaked each other. Fix: `singleFork` in Vitest (sequential files) with an
   explanatory comment. Real isolation (a DB per suite) waits until suite
   time justifies it.
3. **CRLF vs Prettier.** After branch checkouts, `core.autocrlf` materialized
   CRLF files and `format:check` failed repo-wide. Fix: `.gitattributes`
   (`text=auto`) + Prettier `endOfLine: auto`. Lesson: line-ending policy is
   repo infrastructure — declare it on day one, not when CI goes red.

## At 10x scale

Creation is the low-QPS path (M21: ~40/s avg) — random generation + one
indexed INSERT each is ample. The retry loop's cost stays flat until the code
space fills; no bottleneck here before M5/M6 concerns. First pressure point
under growth is duplicate-alias contention messaging, not throughput.

## Before M3

Understand: why the service (not the repo, not the DB) decides what a
conflict _means_; why random codes need a retry loop and what distribution
math says about it; why the generator lives in its own module with an
INTERIM label. M3 deletes the loop — watch for exactly what disappears.
