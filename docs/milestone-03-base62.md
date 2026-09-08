# Milestone 3 — Base62

## What was built

`encodeBase62` / `decodeBase62` over `0-9a-zA-Z` (`src/utils/base62.ts`), 6
unit tests (zero, known vectors, compactness, MAX_SAFE_INTEGER round-trips,
invalid inputs, overflow), a transactional `createWithGeneratedCode`
repository method (insert → encode id → update, one transaction), and the
service rewired to sequence-id → Base62. **Deleted:** the M2 retry loop,
`MAX_CODE_ATTEMPTS`, and `src/utils/short-code.ts`. Live codes are now `3`,
`4`, … — short and deterministic.

## Why this way

- **Determinism replaces probability.** The same id always yields the same
  code, so collisions are impossible by construction. The retry loop didn't
  get safer — it got unnecessary. That's the strongest kind of fix.
- **Compactness.** 1M urls → 4 chars, 1B → 6, vs fixed 7-char random codes.
  Shorter URLs are the product; Base62 is just base-64 without the two
  URL-hostile characters (`+`, `/`).
- **Transaction, not two requests.** The placeholder (`tmp-<uuid>`) satisfies
  NOT NULL and is invisible outside the transaction, so no half-made row is
  ever readable. Insert and code-assignment are atomic — crash between them
  and nothing survives.
- **Decode ships with encode** even though nothing calls it yet: the pair is
  one concept (M4+ tooling and debugging need the inverse), tested together.

## Alternatives considered

- Random codes + retry (M2) → deleted; kept only as the lesson that motivated
  this milestone.
- Hash-based codes (MD5/SHA truncated) → deterministic but fixed-length and
  collision-_resistant_, not collision-_free_; still needs a retry loop.
- UUIDs as codes → 36 chars, defeats the product purpose.
- Counter in Redis → fast but introduces a second source of truth for
  identity; the PG sequence already exists and is transactional with the row.

## Trade-offs

- **Sequential ids leak and predict.** Codes `3`, `4`, … reveal creation
  order/volume and are enumerable (a scraper can walk them). Accepted for
  now: no auth, no abuse story yet. Mitigations (offset/scramble, sparse
  ids, rate limiting on redirects) belong to M8/security review, not M3.
- **Single-sequence write bottleneck.** Every generated code takes the next
  sequence value on the primary — fine at ~40 creations/s (M21), but the
  first distributed bottleneck. M22 answers with Snowflake-style ids; the
  `encode(id)` seam already accepts any integer source.
- `decodeBase62` caps at MAX_SAFE_INTEGER (codes ≤ 11 chars). Beyond that
  needs BigInt — a documented future step, unreachable at our volumes.

## Failure scenarios

- Crash between insert and update → transaction rolls back, sequence gaps
  (harmless: uniqueness, not contiguity — M1 principle).
- Alias-path conflicts still map via the `.cause`-chain walker (M1/M2
  machinery, unchanged and re-verified).
- Invalid inputs fail loudly at the util boundary (RangeError), never as
  silent wrong codes.

## At 10x scale

Creation stays trivially cheap (one txn, two indexed writes). Reads (M4 +
M5) dominate — this milestone's real scaling gift is _shorter_ codes (less
everywhere: URLs, caches, logs). Next bottleneck is read latency, not code
generation.

## Before M4

Understand: why determinism beats retry; what sequential ids reveal and to
whom; where the `encode(id)` seam lets distributed ids slot in later.
M4 (redirect) reads by `short_code` — the index M1 built for exactly this.
