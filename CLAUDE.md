# DR. DUMBBELL

A mobile-first PWA for tracking structured workout programs, with a desktop layout from `lg` up. Also consumed by a native iOS client. Registration is open — anyone can sign up with Google, Apple, or email.

**Routing:** `/` is the public marketing landing page and the only server-rendered route; the authenticated dashboard is `/home`. Every other route is client-rendered exactly as before (see `nitro.routeRules` in `nuxt.config.ts`).

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
│       └── rate-limit.ts      # Upstash rate limiting (no-op when KV not configured)
├── app/
│   ├── pages/                 # File-based routing (Vue pages)
│   │   ├── index.vue          # Public marketing landing page (the only SSR route)
│   │   └── home.vue           # Authenticated dashboard
│   ├── components/
│   │   ├── ios/               # Design-system primitives (<AppCard>, …)
│   │   ├── shell/             # App chrome (<ShellSideNav>, <ShellTabBar>, …)
│   │   ├── marketing/         # Landing-page sections (<MarketingHero>, …)
│   │   └── …                  # Feature components (workout/, history/, pt/)
│   ├── composables/           # Shared logic (useAuth, useWorkout, useAppNav)
│   ├── layouts/               # app · fullscreen · marketing · default
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
- `POST /api/auth/native/email/signin` — email + password via Supabase Auth, returns `{ accessToken, refreshToken }`; 401 carries `data.code: 'email_not_confirmed'` for unconfirmed accounts
- `POST /api/auth/native/email/signup` — creates the Supabase account; returns `{ confirmationRequired: true }` (no tokens, no DB user row until confirmed) or `{ confirmationRequired: false, accessToken, refreshToken }`
- `POST /api/auth/native/email/resend-confirmation` — resends the confirmation email; always `{ success: true }` (anti-enumeration)
- `POST /api/auth/refresh` — exchange refresh token for new access token (optionally rotates)

Native routes mint tokens via `issueTokenPair` (`server/utils/native-tokens.ts`). iOS password reset reuses the web `POST /api/auth/email/reset-password` (session-agnostic; the emailed link opens the web reset page). Both signup routes pass `emailRedirectTo: {appUrl}/auth/confirm` (from `runtimeConfig.public.appUrl`) so confirmation links land on the confirm page instead of the Supabase Site URL fallback — each environment's `/auth/confirm` URL must be in the Supabase redirect allowlist. reset-password likewise builds its `redirectTo` from `appUrl` — never the request origin, since native calls have no meaningful web origin — and each environment's `/auth/reset-password` URL must be allowlisted too.

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
- **Registration is open:** any Google, Apple, or email account can sign up. There is no allow-list or invite gate — do not reintroduce one.
- **Rate limiting:** Auth endpoints (`/api/auth/native/*` including `native/email/{signin,signup,resend-confirmation}`, `/api/auth/refresh`, `/api/auth/email/{signup,signin,reset-password,update-password}`) use Upstash sliding window (10 req/min per IP). No-ops when `UPSTASH_REDIS_REST_URL` is absent (dev mode). Every unauthenticated auth route must call `rateLimitByIp(event)` as its first statement — before `readBody` — since open registration makes them internet-facing.
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
- Use `<AppSkeleton>` (`app/components/ios/Skeleton.vue`) — do not hand-roll `animate-pulse` divs.
- Size each one to approximate the content it stands in for (`:height="64"` for a
  list row, `:height="128"` for a card) rather than a fixed value; a placeholder
  that reflows on load is worse than none.
- For lists, pass `:count="3"` rather than wrapping it in a `v-for`.
- Guard skeletons with the `useFetch` status: `v-if="status === 'pending'"`.

### Design System

The web client mirrors the SwiftUI app's design language, which is Apple's
semantic palette rather than a bespoke theme. See `app/assets/css/main.css`.

- **Never hardcode a colour class.** Use the semantic tokens: `bg-canvas`,
  `bg-surface`, `text-label`, `text-label-secondary`, `text-label-tertiary`,
  `border-separator`, `bg-fill`, `text-tint`, and the named accents
  `text-ios-green` / `ios-orange` / `ios-red` / `ios-purple` / `ios-pink` /
  `ios-mint`. Literal `slate-*` / `violet-*` / `emerald-*` classes are legacy
  and are being removed — light mode cannot ship until they are all gone.
- **Colour is semantic, not decorative:** green = logged or complete, orange =
  extra set / swapped / in-progress / beta, tint (blue) = navigation and
  primary action, red = destructive, purple→pink = the brand gradient rail,
  gray = inert.
- **Type scale** mirrors iOS text styles: `text-large-title`, `text-title`,
  `text-title2`, `text-title3`, `text-headline`, `text-body`,
  `text-subheadline`, `text-footnote`, `text-caption`, `text-caption2`.
- **Radii:** `rounded-card` (14px, the signature surface), `rounded-panel` (12),
  `rounded-tile` (10), `rounded-chip` (8), `rounded-full`.
- Cards have **no border and no shadow**. `shadow-chip` is the only shadow in
  the app, and it is reserved for elements that float above content: the
  scroll-title chip, the resume banner, and the PWA install banner.
- Add `tnum` to any element rendering numbers so digits align, matching
  SwiftUI's `.monospacedDigit()`.
- Reuse the primitives in `app/components/ios/` — `<AppCard>`,
  `<AppActionPill>`, `<AppChip>`, `<AppStatusBadge>`, `<AppStatTile>`,
  `<AppScreenHeader>`, `<AppProgressRing>`, `<AppSheet>`, `<AppSkeleton>` —
  before writing new markup.

### Responsive Layout

The app is mobile-first and stays that way; desktop is an additive layer on
top, in two stages at Tailwind's default breakpoints.

- **`lg` (1024px)** — the shell changes: the bottom tab bar becomes a
  `w-sidenav` side rail, the `< Back` bar becomes a breadcrumb, and everything
  centres in a `max-w-frame` window. iPad portrait stays on the phone shell
  deliberately.
- **`xl` (1280px)** — the dense screens (Home, Analytics, History, Programs)
  go two-column.
- **`/login` is the one exception**, switching to its side-by-side card at
  `md` (768px). It is a standalone page with two short columns rather than a
  nav rail plus content, so it has room to split sooner.
- **Geometry tokens** live in `main.css` §4: `max-w-frame` (1440),
  `max-w-column` (768, single-column at `lg`), `max-w-content` (1120,
  two-column at `xl`), `w-sidenav` (260). Do not add `--breakpoint-*`
  overrides — they are global and would ripple through every Nuxt UI
  component.
- **Use CSS, not JS.** There is no `useMediaQuery` and no `@vueuse/core`;
  responsive behaviour is Tailwind variants only. `/` is server-rendered, so a
  JS width check there would hydrate-mismatch.
- Drawers and sheets deliberately stay at the phone width — a centred 512px
  panel docked to the bottom edge reads correctly on a large screen.
- `hover:` needs no `lg:` scoping: Tailwind v4 already gates it behind
  `@media (hover: hover)`.

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
- **401 is filtered from Sentry — and only 401:** `sentry.server.config.ts` has a `beforeSend` (`isExpectedClientError`) that drops errors whose `statusCode` is exactly `401`. That is the routine expiry of a 15-minute iOS access token, which the client recovers from via `/api/auth/refresh` — not a server bug. Do **not** "fix" these by capturing them; they are intentionally suppressed to keep the dashboard/quota for actionable errors, and they remain visible in the pino `request.complete` log. Other 4xx (400 validation bugs, 403 authorization failures, 409 state conflicts, 422, 429) **do** reach Sentry deliberately, because they indicate real client/server state bugs. When you add a route, throw `createError` with an accurate `statusCode`; reserve 5xx for genuine server faults.
- **Failed-auth user attribution:** on a failed Bearer verify, `auth.ts` decodes the JWT **without verifying** (`decodeUnverifiedSub`) and attaches the `sub` as an UNTRUSTED id via `Sentry.setUser` + an `auth.failed` tag, and `event.context.unverifiedUserId` (logged, never `userId`). Triage-only — never use `unverifiedUserId` for authorization.
- **OAuth failures — filter on `cause`, not the message.** `nuxt-auth-utils` renders every
  token-exchange failure as the literal string `Apple login failed: Unknown error` (it reads
  `.error_description`/`.error` off a *thrown* FetchError, which has neither), and ofetch's
  `.data`/`.status`/`.response` are **non-enumerable** getters that pino's error serializer
  cannot see — so the provider's real error body never reaches the raw log. Both OAuth error
  paths therefore call `reportOAuthFailure` (`server/utils/oauth-error.ts`), which emits a
  single `oauth.failure` log line carrying a `cause` discriminator: `apple_invalid_client`,
  `apple_invalid_grant`, `bad_private_key`, `id_token_missing`, `id_token_audience`,
  `missing_config`, `db_error`, … Filter Vercel logs and Sentry on `cause`. Each value maps
  to one remediation. Reach for `extractOAuthErrorDetail` before adding ad-hoc logging.
- **The Sentry 401 filter still applies, so OAuth reports use a synthetic error.**
  `handleAccessTokenErrorResponse` stamps `statusCode: 401` on every OAuth failure, which
  `isExpectedClientError` drops on purpose. `reportOAuthFailure` therefore captures a
  synthetic `Error` carrying no `statusCode`, with the detail as tags/extras — do **not**
  "fix" this by loosening `isExpectedClientError`; that would reopen the iOS token-expiry
  firehose. A test asserts the synthetic error survives the filter.
- **Correlating a user report to a log line:** OAuth failures redirect to
  `/login?error=<code>&rid=<requestId>` and `app/pages/login.vue` renders it as
  "Reference: …". That value is the `requestId` on the `oauth.failure` and
  `request.complete` lines.
- **Apple config problems surface in `apple.oauth.config`,** logged on every request to
  `/api/auth/apple`: which of the five `NUXT_OAUTH_APPLE_*` vars are present at **runtime**
  (the `appleAuthEnabled` flag is build-time and cannot see this), their `typeof` — Nitro's
  `applyEnv` runs values through `destr`, so an all-digit key ID silently becomes a number —
  and the detected `.p8` format via `classifyApplePrivateKey`. On a bad format it also logs
  the remediation and a key-material-masked forensic summary. Values are never logged.
- **Apple credentials cannot be validated offline.** Apple checks the grant *before* the
  client secret, so a bogus code always returns `invalid_grant` regardless of whether the
  credentials are valid; its authorize endpoint defers all validation until after the user
  authenticates. `invalid_client` vs `invalid_grant` is only observable from `oauth.failure`
  during a real sign-in — do not build a pre-flight check that claims otherwise.
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
- The verify-app agent runs the QA pipeline (TypeScript check, unit tests — scoped to the impacted areas of the changes by default, build, dev server smoke check) and must pass before changes are considered complete. Say "run verify-app full" to run the entire test suite.
- Do not skip this step, even for small changes.

## Roadmap

**Current phase: Phase 7 — Desktop and the public front door** (Phase 6 is
complete apart from Exercise skip UI and Core workouts)

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
- [x] Apple web OAuth configuration — Services ID + key. The login screen hides
      the Apple button unless **all five** `NUXT_OAUTH_APPLE_*` vars are set
      (`runtimeConfig.public.appleAuthEnabled`), and that flag is computed at
      **build** time — so a var present in the build env but missing at runtime
      renders the button and then fails. Check the `apple.oauth.config` log line
      for the runtime picture.

### Phase 4 — Observability
- [x] pino structured logging middleware
- [x] Sentry error tracking (server) — client still pending
- [x] Sentry performance tracing (API routes + Prisma)
- [x] `/api/health` endpoint

### Phase 5 — Polish & Iteration
- [x] Workout history views
- [ ] Additional programs seeded
- [ ] Offline support (service worker caching)
- [x] ~~Invite system~~ — dropped; registration is open
- [ ] Accessibility review (aria-labels, aria-pressed, keyboard nav, screen reader testing)

### Phase 6 — Web client parity with the iOS app
- [x] Open registration (email allow-list removed, rate limiting extended)
- [x] iOS semantic token layer (`app/assets/css/main.css`) + light/dark/system
- [x] Design-system primitives (`app/components/ios/`)
- [x] Five-tab shell with per-page headers, scroll title chip, resume banner
- [x] DR. DUMBBELL branding, login hero, app icons
- [x] History tab + session detail screens
- [x] Real Settings screen (replaces the drawer and the stub page)
- [x] Strength on the Go (library, detail, live session)
- [x] Between-sets rest timer
- [ ] **Exercise skip UI** — `POST|DELETE /api/workouts/:id/exercises/:peId/skip`
      exist and are tested server-side, but nothing calls them from the web
      client. Needs `useWorkoutSession` actions plus a control on
      `WorkoutExerciseCard`, and skipped exercises must drop out of the
      progress denominator.
- [ ] **Core workouts (Beta)** — `GET /api/exercises/core`,
      `PUT|DELETE /api/workouts/:id/core-workout`,
      `PATCH …/core-workout/complete`. Needs the setup form and the
      full-screen interval timer (84px countdown, green/blue phase wash).
      Largest remaining surface; still flagged Beta on iOS.
- [ ] Home "today" card polish — the resume/start/no-program cards still
      predate `AppCard`; they work but hand-roll their chrome. The start-workout
      card additionally nests the "Preview" `<button>` inside a `role="button"`
      wrapper, which is invalid interactive nesting — fix it in the same pass by
      making "Start next workout" a real sibling button and dropping the
      whole-card click target.

### Phase 7 — Desktop and the public front door
- [x] Desktop shell — 1440px centred frame, 260px side rail replacing the tab
      bar at `lg`, breadcrumbs replacing the `< Back` bar. Nav model and
      breadcrumb map live in `app/composables/{useAppNav,useBreadcrumbs}.ts`;
      chrome in `app/components/shell/`. Below `lg` the phone shell is
      unchanged.
- [x] Two-column layouts at `xl` on Home, Analytics, History and Programs
- [x] Live workout on desktop — exercise flow beside a sticky control rail,
      so progress, the rest timer and Complete stay put while scrolling
- [x] Public marketing landing page at `/`; dashboard moved to `/home`
- [x] Desktop layout for the sign-in screen
- [x] SSR + prerender for `/` only, with SEO/OG meta and a corrected service
      worker navigation fallback
- [ ] **UI screenshots for the landing page** — the slots are wired and empty.
      Populate `SHOTS` in `app/components/marketing/HowItWorks.vue` (three
      phone captures at 390×844 CSS, DPR 2) and `SHOT` in
      `.../Progress.vue` (one at 1280×800 CSS, DPR 2), dark scheme only,
      into `public/img/screens/`. Shoot against `nuxt build && nuxt preview`,
      and scroll `<main>` rather than the window — the app shell is
      `fixed inset-0` and the document does not scroll.
- [ ] Proper Open Graph card — `useSeoMeta` in `app/pages/index.vue` currently
      points at `/icons/icon-512.png` with `twitterCard: 'summary'`. Compose a
      1200×630 `public/img/og-cover.jpg` and switch to
      `summary_large_image`.

### Backlog
- [ ] Configure Apple OAuth (web redirect flow — needed only when web frontend is built)
- [ ] RPE tracking (optional, user-enabled in settings)
- [ ] Fix iPadOS desktop UA detection in `PwaInstallBanner.vue` — iPads in Safari desktop-class mode (iPadOS 13+) report `Macintosh` UA; extend `isIOS` computed to also check `navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1`
- [ ] Push notification triggers (workout reminders, etc.)
- [ ] Manual unlink flow — UI to disconnect a specific provider Identity from a User (covers the "I changed my Apple email" case). Account linking on sign-in is implemented; this is the inverse operation.
- [ ] `GET /api/feedback` authorization gating — restrict results to the authenticated user's own feedback unless the caller has an admin role; only admins should see cross-user entries (flagged by CodeRabbit on PR #93).
- [ ] `GET /api/feedback` pagination — add a hard server-side cap (e.g. `take: 100`) and cursor- or page-based pagination to prevent unbounded system-wide reads as the dataset grows (flagged by CodeRabbit on PR #93).
- [ ] `app/pages/analytics.vue` hardcodes hex colours in the sparkline SVG (`#8b5cf6`, `#1e1b4b`, `#c4b5fd`, `#94a3b8`) — a design-system violation that is far more visible now the chart renders at desktop width. Move them onto semantic tokens.
- [ ] Raw Tailwind type sizes (`text-lg`, `text-sm`, `text-xs`) still in `app/pages/home.vue` and `app/pages/analytics.vue` — migrate to the iOS type scale.
- [ ] Migrate the Analytics stat row to `AppStatTileGroup` / `AppStatTile`; it hand-rolls its own `grid-cols-3`, which is why the group primitive has no real consumer.
- [ ] `text-white` is hardcoded on tint/brand backgrounds in ~11 places (`CalendarStrip`, `PwaInstallBanner`, `ShellResumeBanner`, `pt/*Drawer`, `MarketingHowItWorks`, `offline`, `home`, `feedback`). Add an `--color-on-tint` semantic token and migrate them together — doing one at a time is worse than leaving them consistent.
- [ ] `app/pages/settings.vue` has the same empty-name avatar bug fixed in `ShellSideNav`: `user?.name?.charAt(0) ?? '?'` renders blank for an account with an empty name, since `''` is not nullish.
- [ ] Achieve the 95% code coverage threshold — `vitest run --coverage` fails its configured 95% global thresholds on the current baseline (~74% lines as of 2026-07-09); backfill tests for uncovered server code (e.g. `server/routes/_schemas.ts`, `server/utils/supabase.ts`, scheduled-workouts routes) until the thresholds pass.

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
