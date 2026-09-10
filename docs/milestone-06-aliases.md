# Milestone 6 — Custom Aliases

## What was built

Alias hardening on the M2 foundation: length 3–30, charset (unchanged),
case-insensitive reserved-word set (20 entries, including M14's future
`ready`/`metrics`), case-sensitive semantics documented, and the proof that
matters — 10 concurrent `POST`s for one alias yield exactly 1×201 + 9×409.
Frontend mirror updated (min 3, reserved set, new cases). Live: `health`
and `ab` rejected with field-level 400s.

## Why this way

- **Validation rejects the known-bad; constraints arbitrate the race.**
  Zod handles shape (length, charset, reserved) — cheap, good messages.
  Uniqueness is NOT validated, it is _declared_ (unique constraint) and
  _translated_ (23505 → 409). Any `SELECT`-before-`INSERT` would be a
  time-of-check/time-of-use bug under concurrency; there is none anywhere
  in the path.
- **Reserved words protect routes, not taste.** The redirect router matches
  any single segment — `/health` works today only by registration order.
  An alias `health` wouldn't break the route, but it would create two
  meanings for one path (lookup vs endpoint). Reserved now, including
  routes that don't exist yet (`ready`, `metrics`): the set must grow with
  every new top-level route, and that invariant is written where the set
  lives, not in a future developer's memory.
- **Case-sensitive, like Base62.** `GitHub` ≠ `github`. Normalizing (lower-
  casing) would shrink the namespace 2× and contradict code semantics.
  Users who want both cases claim both aliases — explicit, no magic.
- **Min length 3.** Anti-squatting plus visual distinction from early 1–2
  char generated codes. Arbitrary line? Yes — documented as judgment, not
  math.
- **Mirror, don't share.** The frontend duplicates the reserved set with a
  pointer comment. Separate deployables can't import backend `src`; the
  contract test is behavioral (409/400 parity), and the backend stays truth.

## Alternatives considered

- DB-level reserved table + FK → overkill for a static list; a CHECK with
  20 literals is uglier than Zod and equally application-visible.
- Case-insensitive uniqueness (`CITEXT` / functional index) → contradicts
  Base62 code semantics; rejected for consistency.
- Distributed lock around creation → solves nothing the constraint doesn't,
  adds Redis to the write path and a failure mode. Locks coordinate work;
  constraints declare truth. Prefer truth.
- Pessimistic `SELECT FOR UPDATE` → serializes all creations on contention;
  constraint lets non-conflicting inserts proceed in parallel.

## Trade-offs

- 10-way race test takes ~1s (real HTTP + real DB) — worth it; it's the
  only test that proves the absence of check-then-insert.
- Alias enumeration: sequential probing can't guess aliases, but short
  common words are guessable by design (that's what aliases are for).

## Failure scenarios

- Race loser → 409 with `field: customAlias` (service rewrites the
  ambiguous constraint, M2 machinery). No 500, no duplicate, no deadlock:
  unique-index insertion is atomic under MVCC.
- Reserved/case variants (`HEALTH`) → 400 before touching the DB.
- Cache interplay: alias creation invalidates any cached negative (M5),
  so miss-then-claim sequences resolve correctly — covered by test.

## Frontend hygiene fixed along the way (same branch, separate concern)

- `frontend/.prettierrc` was missing `endOfLine: auto` (backend got it in
  M2) → repo-wide false failures after checkouts. Fixed.
- `next-env.d.ts` is generated output — untracked (gitignored) instead of
  committed.

## At 10x scale

Alias creation stays one indexed INSERT; unique-index contention is
negligible at creation QPS (~40/s). The hot path is unchanged (redirects
don't care how a code was born). No new bottleneck from this milestone.

## Before M7

Understand: constraints-as-arbiters vs locks, why reserved sets are
route-ownership metadata, and why the mirror rule points one way (backend
truth, frontend UX). M7 (lifecycle) gives aliases something to lose: 410s.
