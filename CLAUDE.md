# Workout Tracker

A mobile-first PWA for tracking structured workout programs. Also consumed by a native iOS client. Private use (invite-only).

## Tech Stack

- **Framework:** Nuxt 4 (full-stack, TypeScript)
- **Server Engine:** Nitro (built into Nuxt 4 — not a separate backend)
- **ORM:** Prisma (schema, migrations, typed queries)
- **Database:** PostgreSQL hosted on Supabase (accessed via Prisma connection string)
- **Auth:** Dual-mode — cookie sessions via `nuxt-auth-utils` (web) + JWT via `jose` (native iOS)
- **Deployment:** Vercel
- **PWA:** `@vite-pwa/nuxt`
- **Styling:** Tailwind CSS + Nuxt UI
- **Observability:** pino (structured logging), Sentry (errors + performance tracing)

## Project Structure

```text
workout-tracker/
├── prisma/
│   └── schema.prisma          # Database schema & models
├── server/
│   ├── api/
│   │   ├── auth/              # OAuth + JWT auth endpoints
│   │   │   ├── native/        # Native iOS sign-in (Apple, Google)
│   │   │   └── refresh.post.ts  # JWT token refresh
│   │   ├── devices/           # APNs device token registration
│   │   ├── programs/          # Program library CRUD
│   │   ├── user-programs/     # User's saved & active programs
│   │   ├── workouts/          # Workout session & set tracking
│   │   └── health.get.ts      # Health check endpoint
│   ├── middleware/
│   │   └── auth.ts            # Dual auth guard (JWT Bearer + cookie session)
│   └── utils/
│       ├── prisma.ts          # Prisma client singleton
│       ├── jwt.ts             # Sign/verify HS256 access + refresh tokens
│       ├── jwks.ts            # Apple/Google JWKS verification for native sign-in
│       ├── apns.ts            # APNs push notification utility
│       ├── rate-limit.ts      # Upstash rate limiting (no-op when KV not configured)
│       └── allowList.ts       # Email allow-list helper
├── app/
│   ├── pages/                 # File-based routing (Vue pages)
│   ├── components/            # Reusable Vue components
│   ├── composables/           # Shared logic (useAuth, useWorkout)
│   ├── layouts/               # App shell layouts
│   ├── types/                 # TypeScript type definitions
│   ├── middleware/            # Client-side route middleware
│   └── plugins/               # Nuxt plugins (v-wave, etc.)
├── public/                    # Static assets, PWA icons
├── nuxt.config.ts             # Nuxt + PWA + module config
└── .env                       # Supabase URL, OAuth secrets, JWT secrets, APNs keys
```

## Database Schema

Domain organized around immutable program definitions, mutable user progress, and auth/push infrastructure:

- **Program library (immutable):** `Program → ProgramWeek → ProgramDay → ProgramExercise → ExerciseSet`
- **User progress (mutable):** `User`, `UserProgram` (saved/active + current position), `WorkoutSession`, `CompletedSet`
- **Auth identities:** `Identity` (one User can have many — Google, Apple, email — keyed on `(provider, providerId)`)
- **Auth tokens:** `RefreshToken` (hashed, 30-day, revocable)
- **Push:** `DeviceToken` (APNs token per user device, soft-deletable)

All models use `cuid()` for primary keys. See `prisma/schema.prisma` for full definitions.

## Dual-Auth Model

The API supports two authentication paths that share a single `server/middleware/auth.ts` guard:

| Client | Auth method | How it works |
|---|---|---|
| Web PWA | Cookie session | `nuxt-auth-utils` sets a 30-day encrypted cookie after OAuth login |
| Native iOS | JWT Bearer | Short-lived access token (15 min) + long-lived refresh token (30 days) stored as SHA-256 hash in `RefreshToken` table |

**Detection:** The middleware checks `Authorization: Bearer <token>` first. If present, it calls `verifyAccessToken` (HS256 via `jose`). If absent, it falls back to `getUserSession` (cookie). Both paths set `event.context.userId`.

**Native sign-in endpoints** (under `/api/auth/`, public):
- `POST /api/auth/native/apple` — accepts Apple identity token from iOS SDK, returns `{ accessToken, refreshToken }`
- `POST /api/auth/native/google` — accepts Google ID token from iOS SDK, returns `{ accessToken, refreshToken }`
- `POST /api/auth/refresh` — exchange refresh token for new access token (optionally rotates)

**Native logout:** send `X-Client-Type: native` header; optionally include `refreshToken` in the body to revoke it.

## iOS Client Notes

- The iOS app lives in a separate repository and consumes this API over HTTPS.
- It uses Sign in with Apple as primary auth and Sign in with Google as secondary.
- Native sign-in flow: iOS SDK returns an identity token → send to `/api/auth/native/{apple|google}` → receive JWT pair → store securely (Keychain).
- Token refresh: on 401, POST to `/api/auth/refresh` with the refresh token.
- Push notifications: register device token via `POST /api/devices/register` after sign-in. Environment must be `SANDBOX` for development builds, `PRODUCTION` for App Store builds.
- Apple identity token audience is the **bundle ID** (e.g. `com.example.fitnesstracker`), not the web service ID.

## API Security

- **CORS:** Restricted to `NUXT_PUBLIC_APP_URL` origin (never `*`). Native iOS apps don't send `Origin` headers so CORS doesn't apply to them. OPTIONS preflights are handled without auth.
- **Rate limiting:** Auth endpoints (`/api/auth/native/*`, `/api/auth/refresh`) use Upstash sliding window (10 req/min per IP). No-ops when `UPSTASH_REDIS_REST_URL` is absent (dev mode).
- **Error responses:** All routes return generic error messages — no stack traces or Prisma error details exposed.
- **Input validation:** Manual inline validation on all routes (same pattern as existing API); Zod is not used.

## Environment Variables

See `.env.example` for the full list. Key variables for native iOS support:

```bash
NUXT_JWT_ACCESS_SECRET=      # HS256 signing key for access tokens
NUXT_JWT_REFRESH_SECRET=     # HS256 signing key for refresh tokens
NUXT_JWT_REFRESH_ROTATION=   # Set to "true" to rotate refresh tokens on each use
NUXT_APPLE_BUNDLE_ID=        # iOS app bundle ID (audience for Apple identity tokens)
NUXT_APNS_TEAM_ID=           # Apple developer Team ID
NUXT_APNS_KEY_ID=            # APNs .p8 Key ID
NUXT_APNS_PRIVATE_KEY=       # base64-encoded .p8 file content
NUXT_PUBLIC_APP_URL=         # Web frontend origin for CORS
UPSTASH_REDIS_REST_URL=      # Optional — enables rate limiting
UPSTASH_REDIS_REST_TOKEN=    # Optional — enables rate limiting
```

## Conventions

### TDD Workflow

- Follow test-driven development: write failing tests before implementing features
- Bug fixes must include a regression test that reproduces the issue before applying the fix
- Run the relevant test suite after implementation to confirm tests pass

### Loading Skeletons

- Every UI area that fetches data from an API must display a loading skeleton while the request is pending.
- Use the established pattern: `<div class="h-[SIZE] animate-pulse rounded-lg bg-slate-800" />` with an appropriate height.
- For lists, render multiple skeleton items (e.g., `v-for="i in 3"`).
- Guard skeletons with the `useFetch` status: `v-if="status === 'pending'"`.

### Nitro API Routes

- All routes live under `server/api/` and are auto-registered by Nuxt.
- Every route imports the Prisma singleton from `server/utils/prisma.ts`.
- Protected routes rely on the auth middleware in `server/middleware/auth.ts`.
- Route files are named with the HTTP method suffix: `index.get.ts`, `index.post.ts`, `[id].patch.ts`, etc.
- Return objects directly from `defineEventHandler` — Nitro serializes to JSON.
- Use `createError` from `h3` for error responses with appropriate status codes.
- Validate request bodies with manual inline checks (no Zod) consistent with the existing pattern.

### Error Handling

- All API routes should use try/catch and return meaningful error responses.
- Use `createError` from `h3` for error responses with appropriate status codes.

### Observability

Server-side observability is live. **Do not use `console.log`/`console.error` in server code** — use the structured logger.

- **Logging:** `logger` is auto-imported from `server/utils/logger.ts` (pino). In route handlers prefer the request-scoped child logger: `(event.context.logger ?? logger).error({ err, route: 'GET /api/foo' }, 'message')`. The `?? logger` fallback covers non-request contexts (e.g. unit tests). Never string-interpolate; pass structured fields. Secrets are redacted by the logger config.
- **Request lifecycle:** `server/middleware/00.logging.ts` runs before `auth.ts` (numeric prefix orders it first), generates `event.context.requestId`, and logs request completion.
- **Sentry:** `@sentry/nuxt` auto-instruments Nitro (per-request isolation scope, uncaught-error capture, serverless flush) — do **not** add a custom Nitro error-capture plugin; it double-reports. `server/middleware/auth.ts` calls `Sentry.setUser` after auth. Server config is `sentry.server.config.ts`; it no-ops when `SENTRY_DSN` is unset (local dev). On Vercel, `autoInjectServerSentry: 'top-level-import'` in `nuxt.config.ts` is required (serverless ignores Node `--import`).
- **4xx is filtered from Sentry, not 5xx:** `sentry.server.config.ts` has a `beforeSend` (`isClientError`) that drops any error with a 4xx `statusCode` (401/403/404/429/…). These are expected, caller-driven outcomes — notably the routine 401 from an expired iOS access token, which the client recovers from via `/api/auth/refresh` — not server bugs. Do **not** "fix" these by capturing them; they are intentionally suppressed to keep the dashboard/quota for actionable 5xx. They remain visible in the pino `request.complete` log. When you add a route, throw `createError` with the right 4xx `statusCode` so this filter applies; reserve 5xx for genuine server faults.
- **Failed-auth user attribution:** on a failed Bearer verify, `auth.ts` decodes the JWT **without verifying** (`decodeUnverifiedSub`) and attaches the `sub` as an UNTRUSTED id via `Sentry.setUser` + an `auth.failed` tag, and `event.context.unverifiedUserId` (logged, never `userId`). Triage-only — never use `unverifiedUserId` for authorization.
- **Still pending:** client-side Sentry (`sentry.client.config.ts` is a stub).

### TypeScript

- Strict mode enabled.
- Prefer explicit types on function signatures.
- Use Prisma-generated types for database entities — don't duplicate type definitions.

### Git Workflow

#### Commits — [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)

- Format: `<type>(<optional scope>): <description>`
- Allowed types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `ci`, `build`, `perf`
- Breaking changes: append `!` before colon (e.g., `feat!: remove endpoint`) or add a `BREAKING CHANGE:` footer.
- Subject line ≤72 chars, imperative mood.
- Optional body after a blank line explaining _what_ and _why_.

#### Branches — [Conventional Branch](https://conventional-branch.github.io/)

- Format: `<type>/<description>`
- Allowed types: `feat/`, `fix/`, `hotfix/`, `chore/`, `release/`
- Lowercase letters, numbers, and hyphens only — no underscores, spaces, or special chars.
- Include ticket/issue number when applicable (e.g., `feat/issue-42-add-auth`).

#### PRs & Merging

- Keep PRs small and scoped to a single roadmap item.
- CodeRabbit runs automated review on every PR.
- Merge to `main` after review.
- All checklist items in the PR template must be completed (checked) by the submitter before requesting review.

### Verification

- Every implementation plan must include a final step to run the **verify-app** subagent.
- The verify-app agent runs the full QA pipeline (TypeScript check, unit tests, build, dev server smoke check) and must pass before changes are considered complete.
- Do not skip this step, even for small changes.

## Roadmap

**Current phase: Phase 3.5 — Native iOS Client**

### Phase 0 — Init ✅
- [x] Scaffold Nuxt 4 PWA (TypeScript, pnpm, Vercel deploy target)
- [x] Configure PWA manifest and `@vite-pwa/nuxt`
- [x] Set up AI harness: CLAUDE.md, subagents, PR template

### Phase 1 — Foundation ✅
- [x] Initialize Prisma schema with full domain model (9 models)
- [x] Prisma client singleton (`server/utils/prisma.ts`)
- [x] ExerciseGroup model, warmUp field, Brick House seed data
- [x] OAuth routes (Google + Apple) via `nuxt-auth-utils`
- [x] Auth middleware (`server/middleware/auth.ts`)
- [x] Unit test harness
- [x] Deploy to Vercel (initial production environment)

### Phase 2 — API Iteration ✅
- [x] User-program management endpoints (save, activate, deactivate)
- [x] Workout session lifecycle (start → complete sets → complete day)
- [x] Day/week advancement logic
- [x] Program completion handling
- [x] Document API with Scalar

### Phase 3 — Frontend ✅ (mostly)
- [x] Mobile-first layout with Tailwind + Nuxt UI
- [x] Program browser page
- [x] Active workout session UI
- [x] Auth flow pages (login, callback)
- [ ] PWA install / offline config

### Phase 3.5 — Native iOS Client
- [x] JWT infrastructure: `RefreshToken` model, `server/utils/jwt.ts`, dual-auth middleware
- [x] Token refresh endpoint (`POST /api/auth/refresh`)
- [x] Native Sign in with Apple (`POST /api/auth/native/apple`)
- [x] Native Sign in with Google (`POST /api/auth/native/google`)
- [x] Native logout with refresh token revocation
- [x] APNs push infrastructure: `DeviceToken` model, `server/utils/apns.ts`
- [x] Device token registration/unregistration (`POST /api/devices/register`, `DELETE /api/devices/:id`)
- [x] CORS config (restricted to known web origin)
- [x] Upstash rate limiting on auth endpoints
- [ ] Wire up push notification triggers (e.g., workout reminders)
- [ ] Apple web OAuth configuration (backlog — web frontend not yet built)

### Phase 4 — Observability
- [x] pino structured logging middleware
- [x] Sentry error tracking (server) — client still pending
- [x] Sentry performance tracing (API routes + Prisma)
- [x] `/api/health` endpoint

### Phase 5 — Polish & Iteration
- [ ] Workout history views
- [ ] Additional programs seeded
- [ ] Offline support (service worker caching)
- [ ] Invite system
- [ ] Accessibility review (aria-labels, aria-pressed, keyboard nav, screen reader testing)

### Backlog
- [ ] Configure Apple OAuth (web redirect flow — needed only when web frontend is built)
- [ ] RPE tracking (optional, user-enabled in settings)
- [ ] Fix iPadOS desktop UA detection in `PwaInstallBanner.vue` — iPads in Safari desktop-class mode (iPadOS 13+) report `Macintosh` UA; extend `isIOS` computed to also check `navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1`
- [ ] Push notification triggers (workout reminders, etc.)
- [ ] Manual unlink flow — UI to disconnect a specific provider Identity from a User (covers the "I changed my Apple email" case). Account linking on sign-in is implemented; this is the inverse operation.
- [ ] `GET /api/feedback` authorization gating — restrict results to the authenticated user's own feedback unless the caller has an admin role; only admins should see cross-user entries (flagged by CodeRabbit on PR #93).
- [ ] `GET /api/feedback` pagination — add a hard server-side cap (e.g. `take: 100`) and cursor- or page-based pagination to prevent unbounded system-wide reads as the dataset grows (flagged by CodeRabbit on PR #93).

## Subagents

Custom subagents are defined in `.claude/agents/`. Available agents:

- **prisma-db** — Schema changes, migrations, seed scripts.
- **nuxt-api** — Nitro server route implementation.
- **nuxt-frontend** — Frontend pages, components, composables, and Vue/Nuxt client-side code.
- **code-reviewer** — Pre-PR code review (read-only).
- **observability** — Logging and Sentry instrumentation verification.
- **jsdoc-generator** — Add or improve JSDoc comments in JavaScript/TypeScript files.
- **verify-app** — Full QA pipeline verification (TypeScript, tests, build, smoke check).
- **unit-test-writer** — Unit test creation for API routes, components, and composables.
- **user-guide-writer** — User guide documentation updates for new features.
- **vercel-deployment** — Vercel deployment debugging, configuration, and optimization.
- **task-manager** — Save/restore context and maintain CLAUDE.md Roadmap.
- **workout-parser** — Parse workout PDFs into seed.ts data, normalize exercise names, and resolve duplicates before upload.

### Third-party Agent Skills

Third-party skills (e.g., Supabase Postgres best practices) are installed locally in `.agents/` and **gitignored**. They are development tooling, not application code — do not commit them. Developers can install skills locally as needed.
