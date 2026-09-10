# Milestone 9 — Analytics Events

## What was built

`url.clicked` event (`src/analytics/click-event.ts`): shape, builder with
privacy rules, and a synchronous fire-and-forget `ClickEmitter` seam.
`resolveUrl` emits on success only (404/410 emit nothing); the controller
supplies raw HTTP facts, the builder sanitizes. Default sink logs (M10
swaps in the outbox). `analytics_events_created` counter (M14 exposes it).
8 unit + 2 emission tests. Live: `click shortCode=3 ip=… ua=live-probe/1.0`.

## Why this way

- **Event first, transport later.** Defining the shape + seam now lets the
  redirect path depend on an interface, not on RabbitMQ. M10–M12 change the
  sink, never the call site — the seam is the milestone.
- **Success-only emission.** A 404/410 is an HTTP error for M14 metrics, not
  a counted click. Counting errors as clicks would corrupt every downstream
  aggregation at its root.
- **Synchronous contract, guarded.** `emit(): void` — the redirect never
  awaits analytics. Belt-and-braces: the service try/catches emission, so
  even a throwing emitter can't break redirects. Latency isolation is
  structural (no await exists), not conventional.
- **Privacy at construction, not policy.** IPs are anonymized (v4 → /24,
  v6 → /48, mapped-v4 unwrapped, garbage → null) and referers stripped to
  origin+path (queries carry tokens) _before_ the event object exists —
  raw values never sit in a log, queue, or DB by accident. Retention/
  aggregation policy belongs to M12–M13 beside the storage it governs.

## Alternatives considered

- Async emitter (`Promise<void>`) → rejected; an awaitable seam invites
  awaiting it, recreating the coupling M9 exists to prevent.
- Emitting in the controller → rejected; cache-hit and DB paths would each
  need the call (duplication), while the service owns both.
- Full UA parsing now → deferred to M11+; store raw, parse once downstream.
- Hashing IPs instead of masking → masking preserves geo-utility and needs
  no salt management; hashing with a global salt is pseudonymization theater.

## Trade-offs

- Log sink loses events on crash/restart — accepted for exactly one
  milestone; M10's outbox is the durability answer, already sequenced.
- `userAgent` stored raw (fingerprinting-adjacent). Mitigation is retention
  policy + aggregation in M12–M13, recorded here as debt, not ignored.

## Failure scenarios

- Emitter throws → caught, logged, redirect unaffected (tested implicitly
  by contract; a throwing-emitter test would assert this — M10 adds it
  against the real outbox writer).
- Clock skew on `clickedAt` → single-writer timestamps (API instance
  clocks); ordering across instances is approximate until M11 sequences
  ingestion. Documented, not solved — analytics is eventually consistent
  by design.

## At 10x scale

Emission cost today: one object + one log line per redirect (~11.5k/s per
M21 — logging becomes the bottleneck first, another reason the log sink is
temporary). The outbox (M10) moves this cost to a batched background path.

## Before M10

Understand: seam-vs-sink, why success-only, privacy-by-construction, and
why no-await is structural. M10 persists these same events transactionally
— same shape, same call site, durable sink.
