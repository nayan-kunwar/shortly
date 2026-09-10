# Milestone 10 — Transactional Outbox

## What was built

`outbox_events` table (migration 002, partial index on pending rows),
Drizzle mirror, `OutboxRepository` (idempotent append, `SKIP LOCKED` claim
with exponential backoff, publish marking, purge), `OutboxClickEmitter`
(fire-and-forget append, now the production default), and the publisher
worker (`publishBatchOnce` + infinite loop, confirms-gated marking,
`npm run worker:publisher`). RabbitMQ in compose + `RABBITMQ_URL` wiring.
9 outbox/publisher tests. Suite 60/60.

## Why this way

- **Outbox, not direct publish.** Publishing to RabbitMQ inside the redirect
  would couple click latency to broker health. The INSERT is local (~1ms),
  always available when PG is; the broker can be down for hours without
  losing or slowing a single redirect. Durability boundary: after INSERT
  commit, the event is safe; before it (crash in the fire-and-forget
  window), it isn't — redirect latency wins that trade, documented.
- **Claim, don't scan-and-pray.** `FOR UPDATE SKIP LOCKED` lets N publisher
  instances share the table with zero coordination and zero double-delivery
  within a claim. Attempts/backoff stamped at claim time, so a crashed
  publisher needs no recovery pass — its rows simply become due again.
- **Confirms gate marking.** `waitForConfirms` before `markPublished`:
  the broker acknowledged durable receipt. Crash between confirm and mark
  republishes a duplicate (same `messageId`) — M11 dedupes on it.
- **event_id random per emission.** Deterministic ids (code+timestamp)
  would dedupe two same-millisecond clicks into one. Idempotency keys must
  identify _occurrences_, not _entities_ — caught during implementation,
  fixed before commit.
- **Partial index on pending rows.** The poll predicate is exactly
  `published_at IS NULL`; the index keeps it O(due), and published history
  never slows polling.

## Alternatives considered

- Dual-write (DB + broker in request path) → inconsistent on partial
  failure, exactly the failure mode the outbox exists to kill.
- Debezium/CDC tailing WAL → correct at scale, heavy machinery (Kafka
  Connect cluster) for one table; graduate if publishers multiply.
- Polling vs LISTEN/NOTIFY → polling is dumber and survives restarts with
  no missed notifications; 2s latency is fine for analytics.

## Trade-offs

- 2s publish latency floor (poll interval) — analytics is eventually
  consistent anyway; lower the interval if M13 UX demands.
- At-least-once duplicates downstream — accepted, M11 handles.
- amqplib pinned to 0.10 (v2 reshaped its API; types target 0.10).
  Revisit deliberately, not incidentally.

## Failure scenarios (proven)

- Broker down → publisher rejects, loop backs off 10s, rows wait with
  growing `next_attempt_at`; redirects unaffected (test + live).
- Publisher crash mid-batch → unmarked rows reclaimed by backoff schedule.
- Duplicate append (same event_id) → one row (test).
- **Stray publisher incident (this milestone):** an interrupted live check
  left an infinite-loop worker alive, silently publishing rows. Caught via
  broker connection forensics, killed by PID. Lesson banked: worker
  processes get supervision (M16 compose `restart` + one instance), and
  live checks use one-shot batch calls, never the loop.

## At 10x scale

Outbox throughput: one indexed INSERT per click (~11.5k/s per M21) is PG's
comfort zone; the publisher batches 100 with one confirms round. First
pressure: poll contention with N publishers (SKIP LOCKED scales fine) and
table bloat (purge job cadence in M21).

## Before M11

Understand: seam-vs-sink (M9) realized, claim-vs-scan, confirms-before-mark,
and why duplicates are a consumer problem. M11 builds that consumer.
