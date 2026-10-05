# Local development

How to run the API against a local database instead of the hosted one, and the
rules that keep the two apart.

## Why there are two databases

`.env` points at the **hosted Supabase project, which production also uses**.
Anything you do through a server started with `.env` reaches real users: a
follow sends them a notification and an APNs push, a report emails the
moderator, and a test account shows up in user search.

`.env.dev` points at a **local Supabase stack** running in Docker on your Mac.
It has the same schema and the program library, plus a fixed set of fake
accounts with follows, posts, reactions, a block and an inbox. Use it for
feature work, iOS work and trying out migrations.

## Rules

1. **Feature work runs on the local stack.** Start the server with
   `pnpm dev:local`, not `pnpm dev`. Use `pnpm dev` only to look at real
   data, and treat every write it makes as a production write.
2. **Never point a dev script at the hosted database.** The scripts in
   `scripts/dev/` call `assertLocalTarget` (`scripts/dev/local-guard.ts`) and
   exit unless `DATABASE_URL` and `NUXT_SUPABASE_URL` are `localhost`/`127.0.0.1`.
   Don't weaken or bypass that check. Any new script that writes fake data
   must call it first.
3. **Write migrations against the local database first**
   (`pnpm db:local:migrate:new --name <name>`), then run them through
   `pnpm db:local:reset`. Applying a migration to the hosted database is still
   a separate, deliberate step, and it still needs expand/contract: production
   runs `main`'s Prisma client against that same database.
4. **Prisma owns the schema.** `supabase/migrations/` stays empty and
   `[db.migrations]` is off in `supabase/config.toml`. Don't use
   `supabase db diff`, `supabase migration new` or Studio's table editor to
   change the schema; the change would be missing from `prisma/migrations`.
5. **`.env.dev` is never committed** (`.env.*` is gitignored), and it holds
   no production secret. Its JWT secrets are random and local, so a token
   minted locally is rejected by production and the other way round.
6. **One local stack per Mac.** `project_id` in `supabase/config.toml` is
   fixed, so every worktree shares the same containers and data. Two
   worktrees with different schemas need a `pnpm db:local:reset` when you
   switch between them.

## First-time setup

You need Docker Desktop running, and the Supabase CLI
(`brew install supabase/tap/supabase`).

```bash
pnpm db:local:start        # pulls images on the first run (a few GB), then ~15 s
pnpm db:local:env          # writes .env.dev from `supabase status`
pnpm db:local:reset        # empty DB → migrations → programs → social fixtures → workout history
pnpm dev:local             # http://localhost:3000, also on your LAN
```

`.env.dev` lives in the main checkout. In a worktree, symlink it rather than
copying, so every checkout shares one set of local JWT secrets:
`ln -s ../../../.env.dev .env.dev` (from `.claude/worktrees/<name>/`). The
stack is already running and holds the same data.

| What | Where |
|---|---|
| API (Nuxt) | `http://localhost:3000` |
| Supabase Studio (browse tables) | `http://localhost:54323` |
| Mailpit (every email Auth sends) | `http://localhost:54324` |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

`pnpm db:local:stop` stops the containers and keeps the data.

## The fixture accounts

Password for all of them: `password123`. Sign in with email, on iOS
(`POST /api/auth/native/email/signin`) or on the web.

| Email | Username | Profile | Relationship to `me` |
|---|---|---|---|
| `me@drdumbbell.test` | `@dev_me` | private | the account you sign in as |
| `alice@drdumbbell.test` | `@alice_lifts` | public | you follow her; she reacted to your post |
| `bob@drdumbbell.test` | `@bob_benches` | private | your follow request to him is pending; his post is hidden from you |
| `carol@drdumbbell.test` | `@carol_cardio` | public | her follow request to you is pending (in your inbox) |
| `dave@drdumbbell.test` | `@dave_deadlifts` | public | you blocked him |
| `erin@drdumbbell.test` | `@erin_squats` | private | you follow each other; she reacted to your post |
| `fresh@drdumbbell.test` | `@fresh_start` | private | none: no follows, posts, workouts, program or bio, for the empty states |

To test both sides of an interaction, sign in as `bob` and accept the
request from `me`.

### Workout history

| Account | Active program | Done | Next |
|---|---|---|---|
| `me` | Brick House | weeks 1–2, 10 workouts, every set logged with weights | week 3, day 1 |
| `alice` | Pool Season | 3 workouts | week 1, day 4 |
| `erin` | Oak Tree | 6 workouts | week 2, day 7 |

`me`'s workouts run three days on, one off, ending yesterday, so History,
Analytics (volume, streak, per-exercise progress) and Home all have data.
Percentage sets ("70% of Bench 1RM") use assumed maxes of bench 205, squat 275
and deadlift 335 lb. Other lifts add 5 lb in week 2. `alice` and `erin` give
the profile stats (active program and workout count) something to show.

### Resetting

- `pnpm db:local:seed-social` puts the social graph back as above. It leaves
  workouts and programs alone. Run both to return `fresh` to empty.
- `pnpm db:local:seed-workouts` puts the workout history back. It **deletes
  every program run and on-the-go session a fixture account holds**, including
  workouts you logged by hand while testing. The dates are recomputed from today, so re-run it
  after a few days away to keep the streak live.
- `pnpm db:local:reset` rebuilds everything from empty.

## Pointing the iOS app at your Mac

- **Simulator:** `http://localhost:3000`.
- **Physical device on the same Wi-Fi:** `pnpm dev:local` already listens on
  your LAN. Use `http://<your-mac>.local:3000` (System Settings → General →
  Sharing shows the name) or the IP from `ipconfig getifaddr en0`.
- Make the base URL a Debug-only build setting so a release build can never
  ship pointing at your Mac. This is the only change the app needs before it
  can talk to the local server.
- These URLs are plain HTTP. App Transport Security already allows
  `localhost` and raw IP addresses, so the Simulator normally needs no
  exception. Add `NSAppTransportSecurity` → `NSAllowsLocalNetworking = YES`
  to the **Debug** Info.plist only if a request fails with
  `NSURLErrorDomain Code=-1022` ("App Transport Security policy requires the
  use of a secure connection"). That's most likely on a physical device using
  a `.local` name. Keep it out of the Release configuration.

## What behaves differently locally

- **No pushes.** APNs isn't configured, so a notification is written to the
  inbox and the push is skipped with an `[APNs] Missing appleBundleId` warning.
  The request still succeeds. Read the inbox with `GET /api/notifications`.
- **Email confirmation is off** (`enable_confirmations = false`), so
  `native/email/signup` returns tokens straight away
  (`confirmationRequired: false`). Turn it on in `supabase/config.toml` to
  test the confirm flow; the email lands in Mailpit.
- **No rate limiting, Sentry or web OAuth.** Google and Apple *web* sign-in
  need redirect URLs registered with each provider, so use email sign-in
  locally. Native Apple/Google sign-in works if you copy
  `NUXT_APPLE_BUNDLE_ID` / `NUXT_GOOGLE_IOS_CLIENT_ID` into `.env.dev`.
- **No exercise demo clips.** The `exercise-media` bucket exists but is empty;
  the licensed clips stay in the hosted bucket only.
- **The reminder sweep doesn't run by itself.** There is no `pg_cron` job
  locally. Trigger it by hand:

  ```bash
  curl -X POST -H "Authorization: Bearer local-sweep-secret" \
    http://localhost:3000/api/internal/notifications/sweep
  ```

## Troubleshooting

- **`supabase start` fails with `failed to parse environment file: .env`.**
  The CLI reads the project's `.env` with a stricter parser than Node's
  dotenv. Every line must be blank, a `# comment` or `KEY=value`; a stray
  line such as `---` makes it fail. Comment the line out.
- **Docker Desktop quits on launch with `cannot resize … Docker.raw …
  permission denied`.** The VM disk image is owned by `root` (usually from an
  earlier `sudo docker`). Quit Docker, then either
  `sudo chown "$USER":staff ~/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw`
  or delete that file; Docker creates a new one and you lose its images.
- **Sign-in returns 401 after `pnpm db:local:env --force`.** New JWT secrets
  invalidate every token the app holds. Sign in again.
