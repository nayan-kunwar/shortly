# Shortly Frontend — Agent Instructions

You are a senior frontend engineer working on **Shortly**, a production-oriented, full-stack Bitly-like URL shortening and analytics platform.

The repository already contains the overall system architecture and backend requirements in the root `AGENTS.md`.

**Read the root `AGENTS.md` before implementing anything.**

The root architecture is the source of truth for:

- Backend architecture
- API contracts
- PostgreSQL
- Redis
- RabbitMQ
- Analytics
- Rate limiting
- Observability
- Load balancing
- Failure handling
- System-design decisions

This file defines the **frontend-specific architecture and implementation requirements**.

---

# 1. Frontend Goal

Build a polished, production-quality frontend for Shortly.

The frontend is not the main system-design component.

Its purpose is to provide a professional interface through which users can interact with and demonstrate the backend system.

The frontend should clearly demonstrate:

```text
Create URL
     ↓
Short URL
     ↓
URL Management
     ↓
Redirect
     ↓
Click Analytics
     ↓
Analytics Dashboard
```

The UI should make the backend capabilities easy to understand and demonstrate.

---

# 2. Frontend Technology Stack

Use:

- Next.js
- TypeScript
- App Router
- Tailwind CSS
- TanStack Query
- React Hook Form
- Zod
- Recharts
- Lucide React or another lightweight icon library

Do NOT introduce unnecessary libraries.

Prefer the simplest solution that provides a good developer experience.

---

# 3. Backend Integration

The frontend must communicate with the existing Express backend.

Architecture:

```text
Browser
   ↓
Next.js
   ↓
REST API
   ↓
Express
   ↓
Redis / PostgreSQL / RabbitMQ
```

Do NOT duplicate backend business logic inside Next.js.

Do NOT create unnecessary Next.js API routes that simply proxy requests to Express.

The Express backend remains responsible for:

- URL creation
- URL lookup
- redirects
- URL lifecycle
- analytics
- rate limiting
- business rules
- persistence

Next.js is responsible for:

- UI
- routing
- forms
- API state
- loading states
- error states
- charts
- user interaction
- presentation

---

# 4. Frontend Architecture

Use a feature-oriented structure.

Recommended structure:

```text
frontend/
│
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   │
│   │   ├── create/
│   │   │   └── page.tsx
│   │   │
│   │   ├── urls/
│   │   │   ├── page.tsx
│   │   │   └── [shortCode]/
│   │   │       ├── page.tsx
│   │   │       └── analytics/
│   │   │           └── page.tsx
│   │   │
│   │   └── settings/
│   │       └── page.tsx
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── charts/
│   │   └── common/
│   │
│   ├── features/
│   │   ├── urls/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── api/
│   │   │   ├── schemas/
│   │   │   └── types/
│   │   │
│   │   └── analytics/
│   │       ├── components/
│   │       ├── hooks/
│   │       ├── api/
│   │       ├── types/
│   │       └── utils/
│   │
│   ├── lib/
│   │   ├── api/
│   │   ├── query-client/
│   │   └── utils/
│   │
│   ├── hooks/
│   ├── types/
│   └── styles/
│
├── public/
│
├── package.json
└── ...
```

Keep components small and focused.

Avoid putting everything into `page.tsx`.

`settings/` is scaffolded but unscheduled — build it only if a real settings
need appears, otherwise drop it in F9.

---

# 5. Application Layout

Create a professional dashboard-style application.

Desktop layout:

```text
┌──────────────────────────────────────────────────────┐
│ Shortly                           User / Settings  │
├───────────────┬──────────────────────────────────────┤
│               │                                      │
│ Dashboard     │                                      │
│               │                                      │
│ My URLs       │              Main Content            │
│               │                                      │
│ Analytics     │                                      │
│               │                                      │
│ Settings      │                                      │
│               │                                      │
└───────────────┴──────────────────────────────────────┘
```

The interface should also work well on mobile.

Use responsive design.

---

# 6. Dashboard

Create a dashboard at:

```text
/
```

The dashboard should provide an overview.

Include:

### Quick Create

A prominent URL creation form.

```text
┌─────────────────────────────────────────────┐
│ Create a short URL                          │
│                                             │
│ [ https://example.com/long-url            ] │
│                                             │
│ Custom alias (optional)                     │
│ [ github                                  ] │
│                                             │
│ [ Create Short URL ]                        │
└─────────────────────────────────────────────┘
```

### Statistics

Show useful high-level metrics such as:

```text
Total URLs
Total Clicks
Active URLs
Clicks Today
```

### Recent URLs

Display recently created URLs.

Columns:

```text
Original URL
Short URL
Clicks
Created
Status
Actions
```

Actions:

```text
Copy
View
Analytics
Deactivate
```

---

# 7. Create URL Page

Route:

```text
/create
```

Build a polished URL creation form.

Fields:

```text
Original URL
Custom Alias
Expiration
```

Use React Hook Form + Zod.

Validation should match the backend's expectations.

Do not invent validation rules that contradict the backend.

Frontend Zod schemas deliberately mirror the backend's (max lengths, alias
charset). The backend remains the truth: the frontend must never _accept_
what the backend _rejects_; being slightly stricter for UX is allowed, being
looser is a bug.

When submission succeeds:

1. Show the generated short URL.
2. Provide a copy button.
3. Show the original URL.
4. Provide a link to view analytics/details.

Example:

```text
┌─────────────────────────────────────┐
│ URL created successfully            │
│                                     │
│ https://short.example/abc123        │
│                                     │
│ [ Copy ]  [ View Analytics ]        │
└─────────────────────────────────────┘
```

---

# 8. URL List

Route:

```text
/urls
```

Display all available URLs.

Each row should show:

```text
Short URL
Original URL
Clicks
Created At
Expires At
Status
Actions
```

Provide:

- Search
- Filtering
- Sorting where appropriate
- Pagination if supported by the backend

Do not implement client-side pagination for huge datasets unless the API provides all data intentionally.

Prefer server-side pagination when the backend supports it.

Gating rule: no backend list endpoint exists yet (see the capability map in
§30). Until one is specified, F3 shows only client-side "recently created"
items and says so — never fake a full management view.

---

# 9. URL Details

Route:

```text
/urls/[shortCode]
```

Display:

```text
Short URL
Original URL
Created date
Expiration
Status
Total clicks
```

Actions:

```text
Copy Short URL
Open URL
View Analytics
Deactivate
```

Clearly communicate destructive actions.

Use confirmation dialogs where appropriate.

---

# 10. Analytics Dashboard

Route:

```text
/urls/[shortCode]/analytics
```

This is one of the most important frontend pages.

Make it visually strong.

Display:

### Summary cards

```text
Total Clicks
Today
This Week
This Month
```

### Clicks Over Time

Use Recharts.

Example:

```text
Clicks
  │
  │        ╭──╮
  │    ╭───╯  ╰──╮
  │ ───╯          ╰────
  └──────────────────────
       Date
```

### Geographic Analytics

Show clicks by country.

Example:

```text
India       5,231
United States 3,842
UK          1,234
Germany       832
```

Use an appropriate chart.

Do not add a map library unless there is a clear benefit.

### Device Analytics

```text
Mobile
Desktop
Tablet
```

### Browser Analytics

```text
Chrome
Safari
Firefox
Edge
```

### Referrer Analytics

Display top referrers.

---

# 11. Analytics Data States

Analytics are asynchronous.

The frontend must handle the fact that:

```text
Redirect
   ↓
Event
   ↓
RabbitMQ
   ↓
Worker
   ↓
Analytics DB
```

may take some time.

Therefore the UI must gracefully handle:

```text
No data yet
Data loading
Partial data
Data available
Analytics API unavailable
```

Do not assume analytics are immediately consistent.

Example:

```text
Your click has been recorded.

Analytics may take a few seconds to appear.
```

when appropriate.

---

# 12. API Client

Create a centralized API client.

Example:

```text
src/lib/api/
```

Do not scatter raw `fetch()` calls throughout components.

Prefer:

```text
features/
  urls/
    api/
      create-url.ts
      get-url.ts
      delete-url.ts
      list-urls.ts

  analytics/
    api/
      get-analytics.ts
```

The API client should handle:

- Base URL
- JSON serialization
- Headers
- Error handling
- Response parsing

Use environment variables.

Example:

```text
NEXT_PUBLIC_API_URL
```

Do not hardcode production URLs.

---

# 13. TanStack Query

Use TanStack Query for server state.

Use it for:

- URL list
- URL details
- Analytics
- Mutations
- Cache invalidation

Example conceptual flow:

```text
Create URL
    ↓
POST API
    ↓
Success
    ↓
Invalidate URL list
    ↓
Refresh dashboard
```

For deletion:

```text
DELETE URL
    ↓
Success
    ↓
Invalidate relevant queries
    ↓
Update UI
```

Do not manually duplicate server state unnecessarily.

---

# 14. Loading States

Every API-driven screen must have a proper loading state.

Do not show blank screens.

Use:

- Skeleton loaders
- Spinners where appropriate
- Disabled buttons during mutations

Example:

```text
Loading URLs...

┌──────────────────────────────────────┐
│ ██████████████████                   │
│ ███████████                          │
└──────────────────────────────────────┘
```

---

# 15. Error Handling

Handle errors professionally.

Examples:

### Validation error

```text
Please enter a valid URL.
```

### Duplicate alias

```text
This custom alias is already in use.
```

### Rate limit

```text
Too many requests.
Please try again later.
```

### Backend unavailable

```text
Unable to connect to Shortly.
Please try again.
```

### Analytics unavailable

```text
Analytics are temporarily unavailable.
```

Do not expose raw backend stack traces to users.

Derive UI messages from the actual backend error contract:

```text
400 ValidationError + details[] → field-level form errors
409 Conflict (field: customAlias) → "This custom alias is already in use."
404 NotFound → "This link does not exist."
410 Gone (reason: deactivated|expired) → "This link is no longer available."
429 Too Many Requests (M8, future) → "Too many requests. Please try again later."
5xx / network failure → "Unable to connect to Shortly. Please try again."
```

---

# 16. Copy Short URL

Implement a reusable copy component.

Example:

```text
https://short.example/abc123    [Copy]
```

After copying:

```text
https://short.example/abc123    [Copied ✓]
```

Use the Clipboard API.

Provide accessible feedback.

Copy the absolute `shortUrl` returned by the API verbatim — never join URL
paths client-side.

---

# 17. Responsive Design

The frontend must work on:

- Desktop
- Tablet
- Mobile

Desktop:

```text
Sidebar + Content
```

Mobile:

```text
Top Navigation
Content
```

Tables should become mobile-friendly cards or horizontally scrollable containers where appropriate.

Charts must remain readable on smaller screens.

---

# 18. Accessibility

Follow basic accessibility practices.

Requirements:

- Semantic HTML
- Keyboard navigation
- Proper labels
- Accessible buttons
- Focus states
- ARIA only where necessary
- Sufficient contrast
- Form error messages associated with inputs

Do not sacrifice accessibility for visual effects.

---

# 19. Design System

Create reusable UI components.

At minimum:

```text
Button
Input
Textarea
Select
Dialog
Dropdown
Badge
Card
Table
Skeleton
Toast
Tooltip
Tabs
EmptyState
ErrorState
```

Do not install a massive component framework unless necessary.

Keep the design system consistent.

---

# 20. Visual Design

The application should look like a modern developer/infrastructure product.

Design goals:

- Clean
- Professional
- Minimal
- Technical
- Fast
- Good typography
- Clear hierarchy
- Consistent spacing
- Subtle animations

Avoid:

- Excessive gradients
- Excessive animations
- Huge decorative sections
- Unnecessary glassmorphism
- Generic template-like appearance

The product should feel like a real SaaS/infrastructure dashboard.

---

# 21. Dark Mode

Support:

```text
Light
Dark
System
```

Use Tailwind's dark-mode capabilities.

Persist the user's preference.

Avoid flashing between themes during initial load.

---

# 22. Authentication Boundary

The current backend architecture may not implement full authentication.

Do NOT invent a complete authentication system unless the backend API supports it.

If authentication is not currently available:

- Keep the frontend architecture ready for future authentication.
- Do not fake authentication.
- Do not store fake tokens.
- Do not build security logic that the backend does not support.

If authentication is later introduced into the backend, integrate it through the API contract.

---

# 23. URL Redirect Boundary

The actual redirect endpoint is:

```text
GET /:shortCode
```

The frontend should NOT intercept this route.

For example:

```text
https://short.example/abc123
```

must be handled by the backend redirect system.

Do not create a Next.js page that replaces the backend redirect behavior.

This is important because the redirect path is the backend's high-throughput
path (Redis + PostgreSQL + analytics counting). It is an ownership boundary,
not a routing conflict — the frontend must never own, shadow, or reimplement
redirect behavior, including in previews or demos.

---

# 24. Environment Configuration

Use:

```text
.env.local
```

for local frontend configuration.

Example:

```text
NEXT_PUBLIC_API_URL=http://localhost:3000
```

The Next.js dev server must NOT use port 3000 (the backend owns it).
Run the frontend on port 3001:

```text
PORT=3001
```

i.e. `npm run dev -- -p 3001`. The backend allows this origin via
`CORS_ORIGIN` in non-production; the proxy-route ban (§3) stands.

Use different values for:

```text
development
test
production
```

Never commit secrets.

Never expose server-only secrets through `NEXT_PUBLIC_*`.

Demo topology stays two-terminal (`compose up` for the backend + `npm run dev`
for the frontend). Whether the frontend joins `docker-compose.yml` is decided
in backend M16 — not here, not now.

---

# 25. Frontend Testing

Use Vitest + Testing Library, matching the backend's Vitest setup.
Add Playwright only if an E2E flow earns it (see the E2E section below).

Test:

### Components

- Form validation
- Button states
- Empty states
- Error states
- Loading states

### URL creation

Test:

```text
Valid URL
Invalid URL
Custom alias
Expiration
Successful creation
API failure
```

### URL management

Test:

```text
List URLs
View URL
Delete/deactivate
API failure
```

### Analytics

Test:

```text
Loading
Empty analytics
Loaded analytics
API failure
Charts render correctly
```

### E2E

If practical, implement an end-to-end flow:

```text
Open dashboard
      ↓
Create URL
      ↓
Receive short URL
      ↓
Copy URL
      ↓
Open analytics
      ↓
View analytics
```

---

# 26. Frontend Performance

Avoid unnecessary client-side JavaScript.

Use Next.js Server Components by default where appropriate.

Use Client Components only when interactivity requires them.

Good candidates for Client Components:

- Forms
- Charts
- Interactive tables
- Dialogs
- Copy buttons
- Theme switching

Do not make the entire application a Client Component unnecessarily.

Optimize:

- Images
- Fonts
- Bundle size
- API requests
- Re-renders

Do not prematurely optimize.

Measure before making complicated optimizations.

---

# 27. Security

The frontend must follow secure practices.

Never:

- Store sensitive secrets in client-side code.
- Trust client-side validation as security.
- Render unsanitized HTML.
- Expose backend credentials.
- Put secrets in `NEXT_PUBLIC_*`.

Remember:

```text
Frontend validation
       ≠
Backend security
```

The backend remains the security boundary.

---

# 28. Frontend Error Boundary

Implement appropriate error boundaries for major application sections.

A failure in analytics should not unnecessarily destroy the entire dashboard.

Prefer:

```text
Dashboard
├── URL Statistics      ✓
├── Recent URLs         ✓
└── Analytics Widget    ❌
       ↓
Analytics unavailable
```

rather than:

```text
Analytics failed
      ↓
Entire application crashes
```

---

# 29. Empty States

Create useful empty states.

Example:

```text
No shortened URLs yet.

Create your first short URL to get started.

[ Create Short URL ]
```

Analytics:

```text
No analytics yet.

Clicks will appear here after people use your short URL.
```

Do not show empty tables without context.

---

# 30. API Contract Discipline

The frontend must follow the backend API contract.

Before implementing API integrations:

1. Read the backend OpenAPI documentation.
2. Confirm request/response shapes.
3. Confirm status codes.
4. Confirm error formats.
5. Implement frontend types from the actual contract.

Do not invent API responses.

If the backend API does not currently support something required by the UI, clearly identify the missing endpoint/field instead of silently implementing fake data.

### Backend capability map (backend at M4 — update as milestones land)

```text
UI need                  Backend endpoint                      Status
Create form (F2)         POST /api/v1/urls                     EXISTS (201)
Redirect                 GET /:shortCode                       Backend-owned, no FE work
URL list/search (F3)     GET /api/v1/urls (cursor page)        EXISTS (list milestone)
URL details (F3)         GET /api/v1/urls/:shortCode           EXISTS (list milestone)
Deactivate (F3)          DELETE /api/v1/urls/:shortCode         Planned (backend M7)
Analytics (F4)           GET /api/v1/urls/:shortCode/analytics EXISTS since backend M13
Dashboard stats (F5)     (none)                                NOT IN SPEC — needs decision
Error codes              400/404/409/410 exist; 429 in M8      See mapping in §15
```

F3+ starts only after the NOT IN SPEC rows resolve to a specified endpoint
or an explicit descoped UI. This table is the gate — keep it current.

---

# 31. Mock Data

Mock data may be used during UI development.

However:

**Do not leave mock data connected in production builds.**

Clearly separate:

```text
mock
vs
real API
```

Use mock data only when necessary to develop UI before the backend endpoint is ready.

---

# 32. Frontend Milestones

Do not build the entire frontend at once.

Implement in this order.

## F0 — Frontend Foundation

- Next.js
- TypeScript
- Tailwind
- ESLint
- Prettier
- Basic layout
- Environment configuration
- API client foundation

Verify:

```text
npm run build
npm test
```

---

## F1 — Application Shell

Build:

- Navbar
- Sidebar
- Responsive layout
- Theme
- Navigation
- Basic dashboard shell

---

## F2 — URL Creation

Build:

```text
/create
```

Implement:

- Form
- Validation
- API integration
- Loading
- Errors
- Success state
- Copy functionality

---

## F3 — URL Management

Build:

```text
/urls
/urls/[shortCode]
```

Implement:

- URL list
- Details
- Search
- Status
- Deactivation
- Query caching

---

## F4 — Analytics

Build:

```text
/urls/[shortCode]/analytics
```

Implement:

- Summary cards
- Time-series chart
- Country analytics
- Device analytics
- Browser analytics
- Referrer analytics
- Loading states
- Empty states

---

## F5 — Dashboard

Connect everything into:

```text
/
```

Show:

- URL statistics
- Click statistics
- Recent URLs
- Quick create
- Recent activity

---

## F6 — Error & Resilience UX

Handle:

- API unavailable
- Redis-related backend degradation where surfaced
- RabbitMQ analytics delay
- Rate limiting
- Timeouts
- Empty states
- Partial failures

The UI should remain usable whenever possible.

---

## F7 — Testing

Add:

- Unit tests
- Component tests
- Integration tests
- E2E tests where practical

---

## F8 — Performance & Accessibility

Review:

- Bundle size
- Server/client component boundaries
- Accessibility
- Mobile responsiveness
- Loading states
- Error boundaries
- API request efficiency

---

## F9 — Final Polish

Perform a complete UX review.

Check:

- Typography
- Spacing
- Consistency
- Responsive behavior
- Navigation
- Empty states
- Error states
- Animations
- Accessibility
- Performance

Remove unnecessary complexity.

---

# 33. Frontend ↔ Backend Contract

The expected relationship is:

```text
                     Shortly
                         │
              ┌──────────┴──────────┐
              │                     │
              ▼                     ▼
          Next.js                Express
          Frontend                Backend
              │                     │
              │ REST API            │
              └──────────┬──────────┘
                         │
              ┌──────────┼───────────┐
              ▼          ▼           ▼
           Redis     PostgreSQL   RabbitMQ
                                      │
                                      ▼
                              Analytics Worker
                                      │
                                      ▼
                                Analytics DB
```

The frontend must not bypass the Express API and connect directly to:

```text
PostgreSQL
Redis
RabbitMQ
```

The browser only communicates with the API.

---

# 34. Final Frontend Architecture

The finished frontend should look approximately like:

```text
                         Browser
                            │
                            ▼
                       Next.js App
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
          Dashboard      URL Pages    Analytics
              │             │             │
              └─────────────┼─────────────┘
                            │
                         REST API
                            │
                            ▼
                     Express Backend
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
           Redis        PostgreSQL      RabbitMQ
                                          │
                                          ▼
                                  Analytics Worker
                                          │
                                          ▼
                                    Analytics DB
```

---

# 35. Important Agent Behavior

You are not just building UI.

You are building the frontend for a distributed backend system.

Before making frontend architectural decisions, understand the backend architecture in the root `AGENTS.md`.

Do not duplicate backend functionality.

Do not create fake infrastructure.

Do not invent APIs.

Do not introduce unnecessary dependencies.

For every significant frontend decision explain:

### 1. What are we building?

### 2. Why?

### 3. Why this approach?

### 4. What alternatives exist?

### 5. What are the trade-offs?

### 6. How does this interact with the backend?

### 7. What happens when the API fails?

### 8. What happens at scale?

Prefer:

```text
Simple
   ↓
Correct
   ↓
Reusable
   ↓
Performant
```

over:

```text
Over-engineered
   ↓
Complex
   ↓
Hard to maintain
```

The final frontend should feel like a real product while clearly demonstrating the capabilities of the Shortly backend.

---

# 36. Repository Workflow

This frontend lives in the same repo as the backend. The root
`docs/git-workflow.md` applies in full. Frontend specifics:

- Branches: `milestone/f<N>-<short-name>` (e.g. `milestone/f0-frontend-foundation`).
- Commits: `feat(f<N>):`, `fix(f<N>):`, `docs(f<N>):` — same format, frontend scope.
- Tags ride the backend merges; frontend work merges to `main` via the same
  checklist (build, tests, live check against the real backend).
- Never invent backend endpoints to unblock UI — resolve via the §30
  capability map first.
