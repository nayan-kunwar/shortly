# Git Workflow — shortly

## Rule 1: `main` is always green

- `main` only contains **finished, verified milestones**.
- All milestone work happens on a **separate branch**.
- **Do not merge a milestone branch into `main` until its tests, build, and verification pass.**
- Merges go through **pull requests** (see Rule 5); direct pushes to `main`
  are the exception, not the flow.
- Never commit directly to `main`.

## Rule 2: one branch per milestone

Create the branch off `main` before starting:

```bash
git checkout main
git checkout -b milestone/<N>-<short-name>
```

Naming scheme: `milestone/<N>-<short-name>` (lowercase, hyphens).

| Milestone | Branch name                   |
| --------- | ----------------------------- |
| 0         | _(done on `main`: `70f8b63`)_ |
| 1         | `milestone/1-postgresql`      |
| 2         | `milestone/2-url-creation`    |
| 3         | `milestone/3-base62`          |
| 4         | `milestone/4-redirect`        |
| 5         | `milestone/5-redis`           |

Exception: Milestone 0 is always project setup (toolchain, configs, health
check — no product code) and is committed directly to `main`. Every milestone
after M0 gets its own `milestone/<N>-<short-name>` branch.

## Rule 3: commit message format

```
<type>(<scope>): <subject>
```

- `type`: `feat` (new milestone/capability), `fix`, `test`, `docs`, `refactor`, `chore`, `style`, `ci`.
- `scope`: the milestone (`m1`, `m2`), or the package/area (`api`, `web`).
  Always lowercase.
- `subject`: short, imperative, no trailing period. Max ~60 chars.

Body (bullet list): **what was done, task by task**. End with a `Verify:` line
stating which checks passed.

Example:

```
feat(m1): postgresql storage and UrlRepository

- Add urls migration with PK, unique constraints, indexes
- Add UrlRepository (create, findByShortCode, deactivate)
- Add repository tests (insert, lookup, uniqueness, expiry)

Verify: npm run typecheck, build, test green.
```

## Rule 4: milestone close-out checklist

Before merging a milestone branch:

1. `pnpm --filter @shortly/api run typecheck` green
2. `pnpm --filter @shortly/api run build` green
3. `pnpm --filter @shortly/api run test` green
4. `pnpm --filter @shortly/api run lint` + `pnpm --filter @shortly/web run lint` green
5. `pnpm --filter @shortly/web run build` green
6. `pnpm --filter @shortly/web run typecheck` green
7. `pnpm format:check` green (CI enforces it — see Rule 7)
8. Live verification done (documented in `docs/milestone-NN-*.md`)
9. `git status` clean, no secrets (`.env` never committed)

Merge only when all pass.

Standing rule: when a milestone finishes, the agent runs the whole
close-out unprompted — commit on the milestone branch, push it, open a PR,
wait for CI green, merge to `main`, tag `m<N>-done`, verify `main`, push
`main` + tag, and open the next `milestone/<N+1>-<name>` branch.

## Rule 5: tag every merge, keep branches

After merging a milestone into `main` (via pull request), tag it so every
milestone stays a permanent, check-out-able checkpoint:

```bash
gh pr create --title "..." --body "..."  # CI must go green
gh pr merge --merge                      # then tag the merge
git checkout main && git pull --ff-only
git tag m<N>-done && git push origin m<N>-done
```

Tag scheme: `m<N>-done` (e.g. `m1-done`, `m2-done`).

Milestone branches are **kept, not deleted** — `git branch` doubles as the
milestone index, and `git tag` lists the production checkpoints on `main`.

## Rule 6: fix branches (one problem per branch)

Bugfixes and chores follow the milestone flow minus the tag:

- Branch: `fix/<short-name>` (bugs) or `chore/<short-name>` (hygiene), off `main`.
- Commits: `fix(<scope>):` / `docs:` / `chore:` — same format as Rule 3.
- Verification: the full nine-step checklist (Rule 4). No merging red work,
  however small the fix.
- Merge via PR (so CI gates it) or push directly for trivial changes.
  Push the branch either way so it stays reviewable. No tag (tags mark milestones).
- One problem per branch: separate truthful commit messages deserve separate
  branches. Branches are cheap; reviewability and clean reverts are the point.
  The only exception is mechanical unity (a fix plus its test).

## Rule 7: CI gates every merge

`.github/workflows/ci.yml` runs on pushes to `main` and on every pull
request (plus manual dispatch):

- `quality` — `typecheck`, `lint`, `format:check`. No services, fastest signal.
- `test` — full API + web suites against health-gated Postgres 16, Redis 7,
  and RabbitMQ service containers. API tests self-migrate and TRUNCATE a
  shared DB; never run dev workers (publisher/analytics-worker) on the same
  machine at the same time — a live publisher once raced the outbox suite
  over the shared broker and failed it.
- `build` — production builds, gated on green `quality` + `test`
  (`needs`). The web build requires `NEXT_PUBLIC_API_URL` to be set.

Playwright web e2e is deliberately excluded (needs browsers + both
servers); run it locally via `pnpm --filter @shortly/web test:e2e`.

Branch protection is currently **off** (no ruleset): CI reports but does
not block. To make red builds actually stop merges, add a "Protect main"
ruleset requiring the `quality`, `test`, and `build` checks — without the
"require a pull request" rule if direct pushes should keep working.
