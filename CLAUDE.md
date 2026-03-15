# Workout Tracker

A mobile-first PWA for tracking structured workout programs. Private use (invite-only).

## Tech Stack

- **Framework:** Nuxt 4 (full-stack, TypeScript)
- **Server Engine:** Nitro (built into Nuxt 4 — not a separate backend)
- **ORM:** Prisma (schema, migrations, typed queries)
- **Database:** PostgreSQL hosted on Supabase (accessed via Prisma connection string)
- **Auth:** Supabase Auth (Google + Apple OAuth) via `nuxt-auth-utils`
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
│   │   ├── auth/              # OAuth endpoints
│   │   ├── programs/          # Program library CRUD
│   │   ├── user-programs/     # User's saved & active programs
│   │   ├── workouts/          # Workout session & set tracking
│   │   └── health.get.ts      # Health check endpoint
│   ├── middleware/
│   │   ├── auth.ts            # Auth guard
│   │   └── logging.ts         # Request/response logging (pino)
│   └── utils/
│       ├── prisma.ts          # Prisma client singleton
│       └── logger.ts          # Shared pino logger instance
├── app/
│   ├── pages/                 # File-based routing (Vue pages)
│   ├── components/            # Reusable Vue components
│   ├── composables/           # Shared logic (useAuth, useWorkout)
│   ├── layouts/               # App shell layouts
│   └── plugins/
│       └── sentry.client.ts   # Sentry client-side init
├── public/                    # Static assets, PWA icons
├── nuxt.config.ts             # Nuxt + PWA + module config
├── sentry.server.config.ts    # Sentry server-side config
└── .env                       # Supabase URL, OAuth secrets, Sentry DSN
```

## Database Schema

9 models organized around immutable program definitions and mutable user progress:

- **Program library (immutable):** `Program → ProgramWeek → ProgramDay → ProgramExercise → ExerciseSet`
- **User progress (mutable):** `User`, `UserProgram` (saved/active + current position), `WorkoutSession`, `CompletedSet`

All models use `cuid()` for primary keys. See `prisma/schema.prisma` for full definitions.

## Conventions

### TDD Workflow

- Follow test-driven development: write failing tests before implementing features
- Bug fixes must include a regression test that reproduces the issue before applying the fix
- Run the relevant test suite after implementation to confirm tests pass

### Nitro API Routes

- All routes live under `server/api/` and are auto-registered by Nuxt.
- Every route imports the Prisma singleton from `server/utils/prisma.ts`.
- Protected routes rely on the auth middleware in `server/middleware/auth.ts`.
- Route files are named with the HTTP method suffix: `index.get.ts`, `index.post.ts`, `[id].patch.ts`, etc.
- Return objects directly from `defineEventHandler` — Nitro serializes to JSON.
- Use `createError` from `h3` for error responses with appropriate status codes.
- Validate request bodies with a simple validation helper or zod (if added later).

### Error Handling

- All API routes should use try/catch and return meaningful error responses.
- Unhandled exceptions are caught by Sentry automatically.
- Log errors through the pino logger before re-throwing or returning error responses.

### Observability

- Every API request is automatically logged by `server/middleware/logging.ts` (method, route, status, duration, userId, requestId).
- Request IDs are generated with `crypto.randomUUID()` and passed through the event context.
- Sentry captures unhandled exceptions server-side and client-side, tagged with userId.
- Sentry performance tracing is enabled for API routes and Prisma queries.
- New API routes get instrumentation for free — no per-route setup needed.

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

## Roadmap

**Current phase: Phase 1 — Foundation**

### Phase 0 — Init ✅
- [x] Scaffold Nuxt 4 PWA (TypeScript, pnpm, Vercel deploy target)
- [x] Configure PWA manifest and `@vite-pwa/nuxt`
- [x] Set up AI harness: CLAUDE.md, subagents, PR template

### Phase 1 — Foundation 🔄
- [x] Initialize Prisma schema with full domain model (9 models)
- [x] Prisma client singleton (`server/utils/prisma.ts`)
- [x] ExerciseGroup model, warmUp field, Brick House seed data
- [x] OAuth routes (Google + Apple) via `nuxt-auth-utils`
- [x] Auth middleware (`server/middleware/auth.ts`)
- [x] Unit test harness
- [ ] Deploy to Vercel (initial production environment)

### Phase 2 — Observability
- [ ] pino structured logging middleware
- [ ] Sentry error tracking (client + server)
- [ ] Sentry performance tracing (API routes + Prisma)
- [ ] `/api/health` endpoint

### Phase 3 — Workout Engine
- [ ] User-program management endpoints (save, activate, deactivate)
- [ ] Workout session lifecycle (start → complete sets → complete day)
- [ ] Day/week advancement logic
- [ ] Program completion handling

### Phase 4 — Frontend
- [ ] Mobile-first layout with Tailwind + Nuxt UI
- [ ] Program browser page
- [ ] Active workout session UI
- [ ] Auth flow pages (login, callback)
- [ ] PWA install / offline config

### Phase 5 — Polish & Iteration
- [ ] Workout history views
- [ ] Additional programs seeded
- [ ] Offline support (service worker caching)
- [ ] Invite system

### Backlog
- [ ] Document API with Docusaurus (or similar)
- [ ] Configure Apple OAuth

## Subagents

Custom subagents are defined in `.claude/agents/`. Available agents:

- **prisma-db** — Schema changes, migrations, seed scripts.
- **nuxt-api** — Nitro server route implementation.
- **code-reviewer** — Pre-PR code review (read-only).
- **observability** — Logging and Sentry instrumentation verification.
- **jsdoc-generator** — Add or improve JSDoc comments in JavaScript/TypeScript files.
