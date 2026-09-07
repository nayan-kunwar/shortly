# Milestone 1 — PostgreSQL Storage

## What was built

Persistent `urls` table (migration `001_create_urls.sql`), a tiny SQL migration
runner (`npm run db:migrate`), Drizzle ORM over `node-postgres`
(`src/db/schema.ts` + `db`), and `UrlRepository`
(`create / findByShortCode / findByCustomAlias / deactivate / update`) with
`ConflictError` mapping. Postgres runs in Docker Compose (host port **5433** —
see "Failure scenarios"). 7 repository integration tests against a real DB.

## ORM decision (recorded, not re-debated lightly)

- **Drizzle, not raw `pg`, not Prisma.** Raw `pg` was built first, then
  replaced before the M1 commit: query strings + hand row-mapping are toil,
  while the learning goals (constraints, transactions, 23505 mapping) survive
  intact under Drizzle. Prisma was rejected: own schema language, generated
  client, engine binaries, and maximal SQL-hiding — wrong weight for this
  project. Drizzle stays SQL-shaped, keeps `pg` as the driver, has no engine,
  and migrations remain hand-written readable SQL (the `updated_at` trigger
  lives there; Drizzle cannot express triggers).
- **Split of responsibilities.** SQL migration files own DDL (source of truth
  for shape); `schema.ts` owns typed queries (source of truth for code). The
  two must stay in sync by discipline — `drizzle.config.ts` exists so
  `drizzle-kit check` can verify that later.
- **What the ORM changed:** no query strings, no row mapper (Drizzle returns
  camelCase rows matching `UrlRecord`), same interface, same tests — the M1
  boundary held. What it did _not_ change: Postgres is still the source of
  truth, 23505 still owns race safety, migrations are still transactional.

## Why this way

- **PostgreSQL as source of truth.** Every later layer (Redis cache, outbox,
  analytics) derives from this table. If Postgres disagrees with a cache, the
  cache is wrong by definition.
- **Plain-SQL migrations + 30-line runner** instead of a framework. A framework
  hides exactly what M1 is supposed to teach (ordering, idempotency,
  transactional apply). We graduate to one only when migrations get complex.
- **All SQL inside the repository.** Services will talk `UrlRecord`s and
  `ConflictError`s, never query builders, SQL strings, or pg codes. This
  boundary is what lets M5 add caching without touching SQL — and it is what
  made the raw-pg → Drizzle swap a one-folder rewrite with zero test changes.
- **Compose Postgres now, full compose in M16.** M1 tests need a real database;
  starting the compose file early with one service is honest, not premature.
- **ORMs wrap driver errors.** Drizzle rethrows the pg `DatabaseError` inside
  its own `Failed query` error, so 23505 mapping must walk the `.cause` chain
  (`findUniqueViolation`). Abstractions leak at the exact point you map
  errors — budget for that in every ORM decision.

## Schema decisions (every index/constraint justified)

- `id BIGSERIAL PRIMARY KEY` — clustered B-tree; the physical row order. Used
  internally only, never as the short code (codes come from Base62 in M3).
- `UNIQUE (short_code)` — correctness (no two rows share a code) **and** the
  index that makes redirect lookups O(log n). This is the M4 hot path.
- `UNIQUE (custom_alias)` — same, for M6 alias lookups. NULLs don't conflict in
  Postgres, so generated-code rows (alias NULL) never collide with each other.
- **No other indexes.** No query yet needs one. An index on `is_active` alone
  would be useless (low cardinality); we add indexes when a measured query
  needs them (M23 review).
- `CHECK (char_length(original_url) BETWEEN 1 AND 2048)` — defense in depth
  behind the M2 Zod validation; the length (2048) is shared deliberately.
- `user_id TEXT, no FK` — there is no users table yet; a FK to nothing would
  only block inserts. Added when auth exists.
- `expires_at NULL = never expires` + `is_active` soft-delete — expiry is
  **lazy** (checked at redirect time, M4/M7). No DB TTL, no cron yet.
- `updated_at` trigger — the DB keeps it honest instead of trusting writers.
- `TIMESTAMPTZ` everywhere — `TIMESTAMP` (no zone) is a DST bug waiting.

## Alternatives considered

- Prisma/Drizzle/Knex now → rejected for M1; an ORM would hide SQL while the
  goal is learning SQL, constraints, and transactions.
- `SERIAL` (4-byte) → `BIGSERIAL` (8-byte); 2B ids exhaust faster than you
  think at 100M URLs/month (M21 math).
- UUID PKs → rejected; 16 random bytes fragment the clustered index and every
  secondary index carries the PK. Sequential ids keep inserts append-only.

## Trade-offs

- TRUNCATE-between-tests is slower than transactions-per-test but simpler and
  obvious; 7 tests run in ~200ms, so simplicity wins.
- `max: 10` pool is a deliberate small default for one instance; pool sizing
  becomes a capacity-planning knob in M21.

## Failure scenarios (real ones, hit during M1)

1. **Port collision.** A local Windows PostgreSQL already owned host 5432, so
   the container was unreachable (auth failed against the _wrong server_).
   Fix: host port is configurable (`POSTGRES_PORT`, local `.env` uses 5433);
   container port stays 5432. Lesson: when auth fails inexplicably, verify
   _which server answered_ (`SELECT version()`), not just credentials.
2. **Empty env vars shadow `.env`.** dotenv never overrides existing vars, so a
   blank injected `BASE_URL=""` beat the `.env` value. Fix: `env.ts` treats
   `""` as unset. Classic container footgun.
3. **Vitest workers inject `BASE_URL="/"`.** A generic name collides with the
   test runtime. Fix: `vitest.config.ts` pins `test.env.BASE_URL` to the
   documented value. `BASE_URL` stays (AGENTS.md requires the name); the lesson
   is that generic env names are collision-prone — namespace custom ones.

## At 10x scale

Single Postgres + `max: 10` pool holds for M1 volumes. First bottleneck is
write throughput on the primary and redirect read latency — answered by M5
(Redis), then read replicas, then sharding (M22 stages). Sequence gaps from
rollbacks are harmless: codes need uniqueness, not contiguity.

## The race to remember (foreshadows M6)

`SELECT → check exists → INSERT` is broken under concurrency: two requests can
both see "free" and both insert. The unique constraint is the real guard; the
app's job is catching `23505` and answering 409. That mapping
(`mapConstraintError`) is already in the repository.

## Before M2

Understand: why the unique index (not app code) owns correctness; why BIGINT
arrives as a string from node-postgres; why migrations are transactional and
idempotent (`schema_migrations`); why expiry is a column, not a job, for now.
