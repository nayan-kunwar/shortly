# Milestone 19 — OpenAPI

## What was built

OpenAPI 3.0 spec generated from the live Zod validators (`/docs.json`) +
Swagger UI explorer (`/docs`, non-production only), with a contract test
pinning all routes and the no-drift property (spec's `required: [url]`
comes from `createUrlSchema` itself). Live: 8 paths, UI 200, redirect
unaffected. Suite 90/90.

## Why this way

- **Generated, not written.** Hand-maintained YAML drifts from validation
  within weeks; generating from the same schemas that enforce requests
  makes drift structurally impossible. The contract test asserts the
  property, not just the artifact.
- **v7 generator line (Zod v3).** v9 requires Zod v4 — pinned deliberately,
  with the upgrade noted as a future chore, not a surprise.
- **Docs UI dev-only.** Swagger serves the engineers building against the
  API, not production traffic; gating also keeps `/docs*` out of the
  redirect namespace's way in prod.
- **Mounted with the observability set** (before the redirect catch-all):
  `/docs` and `/docs.json` are single-segment GETs the redirect router
  would swallow as short codes. Same invariant, third application.

## Caught during build (both fixed)

- **ESM evaluation order vs side effects.** `extendZodWithOpenApi(z)` in
  the importer's body runs _after_ the imported schemas module evaluates
  its `.openapi()` calls — 11 suites failed at import. Fix: extend inside
  `schemas.ts` itself, before first use. Side-effectful library init
  belongs with its use site, never in a downstream importer.
- **Helper typed `object`.** The v7 builder types demand `ZodTypeAny`;
  `object` doesn't satisfy them. Precise helper signatures, not casts.
- **Live 404 from stale `dist`.** The first live check failed because the
  built output predated the mount — tests run from `src`, servers run
  from `dist`. Rebuild-then-serve is now muscle memory, documented.

## Alternatives considered

- Hand-written `openapi.yaml` → explicit but drifts; rejected on the
  no-drift principle.
- `tsoa`/decorator frameworks → magic routing layer over Express;
  rejected (framework-in-framework for docs alone).
- Redoc instead of Swagger UI → cosmetic choice; Swagger's try-it-out
  wins for a learning API.

## Trade-offs

- Response schemas are hand-mirrored Zod (not inferred from services):
  one more mirror to maintain, covered by the contract test's shape
  assertions. Full end-to-end type inference (tRPC-style) would remove
  the mirror but add a client framework — out of scope for this stack.
- Spec generation runs per `/docs.json` request (cheap, uncached);
  cache it if the endpoint ever profiles hot (it won't).

## At 10x scale

Docs don't scale with traffic — they scale with API surface. The
generation approach means new endpoints document themselves when their
validators land. No bottleneck, by construction.

## Before M20

Understand: generation-vs-manual as drift prevention, ESM side-effect
ordering, and the mount-order invariant (now applied three times). M20
(system design) indexes everything, including this contract.
