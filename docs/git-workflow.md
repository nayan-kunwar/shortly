# Git Workflow — shortly

## Rule 1: `main` is always green

- `main` only contains **finished, verified milestones**.
- All milestone work happens on a **separate branch**.
- **Do not merge a milestone branch into `main` until its tests, build, and verification pass.**
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
<type>(m<N>): <subject>
```

- `type`: `feat` (new milestone/capability), `fix`, `test`, `docs`, `refactor`, `chore`.
- `scope`: the milestone, e.g. `m1`, `m2`. Always lowercase.
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

1. `npm run typecheck` green
2. `npm run build` green
3. `npm test` green
4. `npm run lint` + `npm run format:check` green
5. Live verification done (documented in `docs/milestone-NN-*.md`)
6. `git status` clean, no secrets (`.env` never committed)

Merge only when all six pass. The agent will never merge without being told to.

## Rule 5: tag every merge, keep branches

After merging a milestone into `main`, tag it so every milestone stays a
permanent, check-out-able checkpoint:

```bash
git checkout main
git merge milestone/<N>-<short-name>
git tag m<N>-done
```

Tag scheme: `m<N>-done` (e.g. `m1-done`, `m2-done`).

Milestone branches are **kept, not deleted** — `git branch` doubles as the
milestone index, and `git tag` lists the production checkpoints on `main`.
