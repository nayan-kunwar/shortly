# Milestone 11 — RabbitMQ & Analytics Worker

## What was built

`click_events` table (migration 003, `event_id` unique for dedupe,
`(short_code, clicked_at)` index for M13 reads), `ClickEventRepository`
(idempotent insert → `inserted | duplicate`), and the analytics worker
(`npm run worker:analytics`): validate → persist → ack; poison →
reject-to-DLQ; transient-first-failure → requeue once, then DLQ.
Live full pipeline proven: redirect → outbox → publisher batch → worker →
`click_events` row with anonymized IP. Suite 64/64.

## Why this way

- **At-least-once + idempotent consumer = exactly-once effect.** The
  publisher confirms-then-marks (M10), so crashes duplicate; the broker
  redelivers unacked; the worker dedupes on `event_id`. Each layer is
  allowed to be sloppy about duplicates because exactly one layer
  (the insert) is strict about them. This is the standard distributed
  recipe — reliability from composition, not from any single perfect hop.
- **Validate at the wire, not just at creation.** The builder (M9)
  guarantees shape at emission; the worker re-validates with Zod because
  the broker outlives producers — old code, foreign producers, poison.
  Trust boundaries sit at process edges, not at authorship.
- **Bounded requeue (redelivered → DLQ).** Naked `requeue:true` on every
  failure is an infinite poison loop burning CPU and blocking the
  prefetch window. One retry, then DLQ — transient blips heal, poison
  parks where humans inspect it.
- **Topology declared by every participant.** Exchange/queue/DLQ asserts
  are idempotent, so publisher, worker, and tests each declare what they
  need. No ordering dependency between processes, no setup runbook.
- **Storage table ships with the worker (M11), queries in M12.** The
  worker needs somewhere to persist; splitting write-path (here) from
  read-path (M12) keeps each milestone reviewable.

## Alternatives considered

- Auto-ack → rejected; a crash after processing but before the (automatic)
  ack boundary loses events silently. Manual ack is the whole point.
- Per-message confirm-driven pipeline → the publisher already confirms;
  the worker's ack is the second half of the same guarantee.
- Dead-letter from the start vs added later → from the start; poison
  handling retrofitted is poison discovered in production.
- Nack-everything to DLQ (no requeue) → loses the transient case (DB
  blip during a deploy would DLQ thousands of good events). One requeue
  is the measured middle.

## Trade-offs

- Prefetch 50: throughput vs redelivery blast radius on crash. Tunable
  constant, not architecture.
- `messageId` fallback to randomUUID when absent — a producer that omits
  ids forfeits dedupe; documented, and our publisher always sets it.
- Zod-wire vs TS-type skew (`undefined` vs `null`) normalized at the
  worker edge — same lesson as M4's BIGINT strings: boundaries translate.

## Failure scenarios (tested, not asserted)

- Garbage bytes → DLQ, table untouched, worker alive (test).
- Wrong shape → DLQ (test).
- Same messageId twice → one row (test).
- Worker crash pre-ack → broker redelivers; dedupe holds (design +
  M10's confirm/mark reasoning; chaos test belongs to M15/M18).
- Broker down at worker boot → worker crashes (fail-fast); supervision
  (M16 restart policy) owns recovery, not the worker.
- **Stray worker ate a test's messages (this milestone).** A live check's
  `npx tsx worker &` survived `kill $!` (tsx forks; the parent dies, the
  child lives on), then consumed rows out from under the suite as an
  invisible extra consumer. Diagnosed via queue `consumerCount == 1` with
  nothing running; killed by PID, verified by `consumerCount == 0`.
  Rules banked: never trust wrapper-PID kills for `npx tsx &` (kill by
  verified PID), and `consumerCount` is the oracle for "who else is
  reading my queue".

## At 10x scale

One worker at prefetch 50 handles thousands of events/s against indexed
inserts; the insert (not the broker) is the first bottleneck — answered
by batch inserts, then partitioned tables, then ClickHouse (M22). Adding
worker #2 is free (competing consumers, SKIP-LOCKED-like semantics from
the broker itself).

## Before M12

Understand: at-least-once + idempotent-write as a pair, DLQ as an
operational inbox (not a grave), and why validation lives at process
edges. M12 reads what this milestone wrote.
