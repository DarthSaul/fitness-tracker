# Fitness Tracker

A mobile-first workout tracker for structured training programs. The project ships as two clients backed by a single Nuxt 4 / Nitro server:

- **Web PWA** — installable on desktop and mobile browsers at [fitness-app.me](https://fitness-app.me).
- **Native iOS app** — SwiftUI client in a separate repo: [DarthSaul/fitness-tracker-mobile-app](https://github.com/DarthSaul/fitness-tracker-mobile-app).

> **Status:** Private, invite-only. Sign-in is gated by an email allow-list; this repo is published for portfolio and reference purposes, not for self-hosting.

> **Current phase:** Phase 3.5 — Native iOS Client. See [`CLAUDE.md`](./CLAUDE.md) for the full roadmap.

## Clients

| Client | URL / Repo | Auth | Notes |
|---|---|---|---|
| Web PWA (desktop + mobile browsers) | [fitness-app.me](https://fitness-app.me) | Cookie session (`nuxt-auth-utils`) | Installable as a PWA on iOS/Android/desktop |
| Native iOS (SwiftUI) | [fitness-tracker-mobile-app](https://github.com/DarthSaul/fitness-tracker-mobile-app) | JWT (Bearer access + refresh) | Sign in with Apple (primary), Sign in with Google (secondary) |

Both clients talk to the same Nitro API hosted on Vercel. The server is the single source of truth for programs, sessions, and user progress.

## Architecture

```
┌──────────────────────┐        ┌──────────────────────┐
│  Web PWA             │        │  iOS SwiftUI app     │
│  fitness-app.me      │        │  (separate repo)     │
│  cookie session      │        │  JWT Bearer          │
└─────────┬────────────┘        └──────────┬───────────┘
          │                                │
          └────────────┬───────────────────┘
                       ▼
              ┌──────────────────┐
              │  Nitro API       │
              │  (Nuxt 4, Vercel)│
              └────────┬─────────┘
                       ▼
              ┌──────────────────┐
              │  PostgreSQL      │
              │  (Supabase)      │
              └──────────────────┘
```

### Dual-auth model

A single `server/middleware/auth.ts` guard handles both client types:

- If the request carries `Authorization: Bearer <token>`, the middleware verifies the JWT access token (HS256 via `jose`).
- Otherwise it falls back to the encrypted cookie session set by `nuxt-auth-utils`.

Either path resolves the same `event.context.userId`, so route handlers don't need to know which client called them.

Native sign-in endpoints under `/api/auth/native/` accept platform identity tokens from the iOS SDK (Apple / Google), verify them against the issuer's JWKS, and return a `{ accessToken, refreshToken }` pair. Refresh tokens are stored as SHA-256 hashes in the `RefreshToken` table and can be rotated and revoked.

## Tech stack

- **Framework:** Nuxt 4 (full-stack, TypeScript)
- **Server engine:** Nitro (built into Nuxt 4)
- **Database:** PostgreSQL on Supabase, accessed via Prisma
- **Auth:** `nuxt-auth-utils` (cookie sessions) + `jose` (JWT for native)
- **Styling:** Tailwind CSS + Nuxt UI
- **PWA:** `@vite-pwa/nuxt`
- **Push:** APNs (native iOS only)
- **Rate limiting:** Upstash Redis (sliding window)
- **Hosting:** Vercel
- **Testing:** Vitest + Vue Test Utils

## Project layout

```text
fitness-tracker/
├── app/                 # Vue pages, components, composables, layouts (Nuxt 4 app dir)
├── server/
│   ├── api/             # Nitro API routes (auto-registered)
│   ├── middleware/      # Auth guard, etc.
│   └── utils/           # Prisma client, JWT, JWKS, APNs, rate limiting
├── prisma/              # Schema, migrations, seed data
├── public/              # Static assets, PWA icons
└── nuxt.config.ts
```

A more detailed breakdown — including the API surface and database schema — lives in [`CLAUDE.md`](./CLAUDE.md).

## Local development

Requirements: Node 20+, [pnpm](https://pnpm.io/) 10+, a Postgres database (Supabase recommended).

```bash
pnpm install
cp .env.example .env       # then fill in secrets — see .env.example for descriptions
pnpm prisma migrate dev    # apply migrations
pnpm prisma db seed        # load Brick House program + exercises
pnpm dev                   # http://localhost:3000
```

Useful scripts:

| Command | What it does |
|---|---|
| `pnpm dev` | Start the Nuxt dev server |
| `pnpm build` | Build for production |
| `pnpm preview` | Preview the production build locally |
| `pnpm test` | Run the Vitest unit suite |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:coverage` | Vitest with V8 coverage report |

See [`.env.example`](./.env.example) for the full list of environment variables (Supabase, OAuth, JWT secrets, APNs keys, Upstash Redis, etc.).

## API docs

The API is documented with Scalar. With the dev server running, the OpenAPI reference is available at `/_scalar` (configured in `nuxt.config.ts`).

## Deployment

The app deploys to Vercel from `main`. Environment variables for Supabase, OAuth, JWT, APNs, and Upstash must be configured in the Vercel project settings before deploys will succeed.

## License

See [`LICENSE`](./LICENSE).
