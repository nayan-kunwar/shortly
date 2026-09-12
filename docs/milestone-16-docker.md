# Milestone 16 — Docker

## What was built

Multi-stage `Dockerfile` (builder → non-root runner, prod deps only),
`.dockerignore` (small context, no secrets), compose `api` + `publisher` +
`analytics-worker` services, and a `scripts/docker-healthcheck.js` probe.
`docker compose up` boots all six containers; cold-restart proven with all
healthy. Full pipeline proven inside containers: create → 302 → workers →
analytics row.

## Why this way

- **One image, three commands.** api/publisher/worker differ only in
  entrypoint — one build, one artifact, no drift between processes.
- **Migrations in the api entrypoint** (`migrate && server`), idempotent
  by `schema_migrations`. Workers crash-retry until tables exist; no
  manual ordering, no init container for three services.
- **Service hostnames inside, localhost outside.** Containers talk
  `postgres`/`redis`/`rabbitmq`; host `.env` keeps `localhost` for npm
  dev. The split lives in compose `environment:`, not in code.
- **Healthcheck as a file, not inline `node -e`.** Backticks in
  `CMD-SHELL` strings trigger shell command substitution — the inline
  probe failed silently while `/ready` itself was fine. A script file has
  no quoting layer to break. Caught live (unhealthy container, healthy
  app), fixed properly.
- **Non-root user, no secrets in image.** Config arrives as environment;
  `.dockerignore` excludes `.env*`, `frontend/`, git, and build outputs.

## Alternatives considered

- Separate Dockerfiles per service → triple build time, drift risk, for
  zero benefit when the artifact is identical.
- Init container for migrations → heavier orchestration for an idempotent
  step the api already owns.
- Frontend in compose now → deferred to its own milestone; the demo stays
  two-terminal (compose backend + `npm run dev` frontend).

## Trade-offs

- `docker compose up` now also starts `api` on host :3000 — local npm dev
  must use `docker compose up postgres redis rabbitmq` (named services).
  Documented in the compose header; the alternative (profiles) adds
  concepts for a one-line distinction.
- Image rebuilds on any source change (no bind-mount dev mode). Container
  dev-loop ergonomics belong to a later DX pass, not M16.

## Failure scenarios

- Cold boot ordering: `depends_on: healthy` + entrypoint migrate +
  worker crash-retry cover every startup race (proven by down/up cycle).
- Api unhealthy diagnosis path: check `/ready` directly first (distinguishes
  app-down from probe-broken — exactly how the backtick bug was found).
- **Test runs need infra-only.** Live `api`/`publisher`/`analytics-worker`
  containers share the broker and database with the suite: workers steal
  published test messages and pollute counts (caught twice as phantom
  failures). Rule: `docker compose stop api publisher analytics-worker`
  before `npm test`; restart after.

## At 10x scale

One api replica is the current ceiling — M17 adds replicas + Nginx.
The image is already replica-safe (stateless, config-from-env).

## Before M17

Understand: image layering (why builder/runner split), hostname split
inside/outside, entrypoint migration ownership, and healthcheck-as-file.
M17 (load balancer + horizontal scaling) consumes all of it.
