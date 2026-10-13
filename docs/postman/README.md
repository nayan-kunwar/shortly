# Shortly Postman Collection

Runnable collection for the Shortly API. It chains variables end-to-end
(Register → `{{token}}`, Create → `{{shortCode}}`, anonymous create →
`{{guestId}}`) so a single run exercises auth, guest claim, CRUD,
analytics, redirect, and logout against a live stack.

Source of truth for contracts is still `/docs.json` (OpenAPI). This
collection is hand-maintained; if they disagree, the spec wins and this
file needs an update.

## Import

1. Postman → Import → drop in `shortly.postman_collection.json`.
2. Set `baseUrl` (defaults to `http://localhost:3000`, the local stack).
   Against docker-compose use the same; against nginx use
   `http://localhost:8080`.
3. Run the **Collection Runner** top-to-bottom, or use Newman (below).

## Run order (matters)

Folders run in order: Health & Info → Auth → Guest Flow → Create URLs →
Manage URLs → Analytics → Redirect → Cleanup → Live Stream (manual only).

- **Auth first**: Register mints a unique email per run (pre-request
  script) and captures `{{token}}`. Claim, creates, reads, and analytics
  all need it.
- **Logout lives in Cleanup, last**: it deletes the session row, so
  anything authed after it 401s. Running Logout early breaks the run —
  that is correct server behavior, not a collection bug.
- **Redirect creates its own target**: earlier folders delete their
  codes, so the folder mints a fresh link and follows that. The deleted
  code is followed too, as an explicit 410 demo.

## Newman (automated)

The SSE stream never terminates, so it lives in `Live Stream (manual
only)` and is excluded from automated runs:

```bash
npx newman run docs/postman/shortly.postman_collection.json \
  --folder "Health & Info" --folder "Auth" --folder "Guest Flow" \
  --folder "Create URLs" --folder "Manage URLs" --folder "Analytics" \
  --folder "Redirect" --folder "Cleanup (run last)"
```

Expected: exit 0, 48 assertions, 0 failures (~3s against local stack).

## Rate limits are real — repeats will 429

Limits are per-IP and enforced for real, so rapid re-runs fail **by
design**:

| Bucket                | Budget  | Burns per run |
| --------------------- | ------- | ------------- |
| Auth (register/login) | 10/min  | ~2            |
| Guest creates         | 10/hour | ~2            |
| Authed creates        | 100/min | ~5            |

- Guest 429s cascade: no anchor captured → tagged create 400s → claim
  400s. Wait out the hour, or (local dev only) delete the
  `ratelimit:*` keys in Redis — they are throwaway counters.
- Register uses a timestamped email per run, so it never 409s. The
  custom-alias request does the same (`gh-<timestamp>`).
- Auth 10/min is generous for single runs; hammering Login in a loop
  will trip it.

## SSE (manual only)

`GET /api/v1/urls/:shortCode/analytics/stream` is an authenticated
`fetch()` stream, **not** `EventSource` — browsers cannot attach headers
to EventSource, so the Bearer token rides a `fetch()`. Frames arrive as
`event: <type>` / `data: <json>` pairs with a `:ping` comment every
20s. Open the request, hit Send, watch frames, stop manually. It needs
`{{token}}` and a `{{shortCode}}` you own (run Auth + Create first).

## Redirects: follow is disabled in-collection

`GET /:shortCode` answers **302, deliberately not 301**: a 301 would be
cached permanently by browsers, breaking expiry/deactivation and
silently stopping click counting. The three redirect GETs set
`protocolProfileBehavior.followRedirects=false`, so the runner asserts
on the 302 itself. If you duplicate one, re-disable follow or the test
chases `Location` and never sees the 302.

## Eventual consistency in Analytics

A click is visible only after outbox → publisher → RabbitMQ → worker →
DB. The collection's analytics assertions read links created seconds
earlier; against a loaded stack, allow a few seconds before expecting
`totalClicks > 0`.

## Variables

| Variable                   | Set by                  | Used by                                |
| -------------------------- | ----------------------- | -------------------------------------- |
| `token`, `email`, `userId` | Register / Login        | every authed request (collection auth) |
| `guestId`                  | anonymous create        | tagged create (`X-Guest-Token`), claim |
| `shortCode`, `shortUrl`    | creates                 | details, delete, analytics, redirect   |
| `redirectCode`             | Redirect's own create   | 302 follow                             |
| `deletedCode`              | Delete (stashes victim) | 410 follow                             |
| `alias`, `expiryIso`       | pre-request scripts     | custom-alias, expiry creates           |
