# Milestone 17 — Load Balancer & Horizontal Scaling

## What was built

Nginx entry (`:8080`) round-robining two identical API replicas (`api`,
`api-2`, same image, internal-only), with passive health ejection,
failover retries, `X-Forwarded-*` forwarding, and `trust proxy: 1`
server-side. `/health` carries container hostname so balancing is
observable. Proven live: 20 requests across both instances, api-1 killed
mid-traffic → 10/10× 200 from api-2, restart → healthy rejoin, writes
through the LB. Suite 86/86.

## Why this way

- **Statelessness is the prerequisite, not the result.** Nothing about the
  app changed for scaling except `trust proxy` — because sessions live in
  PG, hot data in Redis, and events in RabbitMQ. M1–M16's architecture
  _was_ the scaling work; M17 just adds instances. If anything had lived
  in process memory, this milestone would have found it (the rate limiter
  would have been exhibit A — Redis saved it retroactively).
- **Round-robin (default), not least-conn/IP-hash.** Requests are uniform
  and stateless — no affinity needed, no warming benefit. IP-hash would
  buy nothing and break the even spread; least-conn matters only with
  heterogeneous request costs.
- **`trust proxy: 1`, never `true`.** Exactly one LB hop is trusted, so
  `req.ip` (rate limiting) sees real clients. `true` would honor spoofed
  `X-Forwarded-For` from any direct connection — a forged-IP rate-limit
  bypass. Precision here is security, not pedantry.
- **Failover via `max_fails` + `proxy_next_upstream`.** Dead replicas stop
  receiving traffic within seconds, and the in-flight failed request is
  retried elsewhere (safe: our reads are idempotent; POST retries could
  duplicate on non-idempotent paths — creation retries are guarded by
  unique constraints resolving to 409, the M6 machinery earning its keep).
- **No session affinity (stigma-free).** Sticky sessions would paper over
  shared-nothing violations; we have none, so we add none.

## Alternatives considered

- ALB/ cloud LB → the learning is identical, the bill isn't; Nginx files
  the concept locally with zero cloud dependency.
- Active health checks (plus/commercial) → passive `max_fails` plus the
  existing `/ready` probe suffice; the api healthcheck already gates
  compose-level restarts.
- More replicas now (api-3..n) → two proves the property (N=1 → N=2 is
  the phase change); further replicas are a copy-paste, added on measured
  load (M21).

## Trade-offs

- `shortUrl` still advertises `:3000` (BASE_URL) while served via `:8080`.
  Correct in spirit (BASE_URL is the canonical public origin; in prod it
  would be the public host), but local demo URLs bypass the LB — noted,
  not fixed; M19 documents the canonical base properly.
- Single Nginx = single point of failure. HA for the LB itself (keepalived
  pair / cloud LB) is a deployment topology, not application code — M22.

## Failure scenarios (all executed live)

- Replica killed mid-traffic → zero failed requests, survivor serves all.
- Replica restarted → health-gated rejoin, balancing resumes.
- Nginx down → total outage (SPOF, documented above) — `docker compose
ps` + container restart is the runbook until M22.

## At 10x scale

Add replicas (copy-paste service blocks); the LB is rarely the bottleneck
(connection fan-out is cheap). Real pressure moves to PG primary writes
and Redis hot keys — M22's stages, in order.

## Before M18

Understand: statelessness-as-prerequisite, trust-proxy precision, and why
N=1→N=2 is the only interesting scaling step. M18 (testing) now covers a
system that includes the load balancer in its topology.
