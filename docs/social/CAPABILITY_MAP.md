# Capability Map: Social

Friends, posts with photos, emoji reactions, and a friends-only feed. API-only
this round (native iOS + web both consume it); web UI is a later initiative.

## Decisions (2026-09-29)

- **Visibility:** each post is `PUBLIC` or `FRIENDS`. The feed shows **friends' posts
  only** (both visibilities). `PUBLIC` posts are additionally visible to anyone on
  the author's profile / by direct link. No global "discover" feed.
- **Feed is computed on read** (fan-out-on-read): one indexed join against
  currently-`ACCEPTED` friendships, keyset-paginated on `(createdAt, id)`. Unfriend
  → posts vanish next fetch; re-friend → they return, history included. No
  materialized feed, no backfill/purge jobs.
- **Ownership:** only the author edits or deletes a post. Anyone who can see a
  post can react to it.
- **Reactions:** many distinct emojis per user per post (Slack-style), unique on
  `(postId, userId, emoji)`.
- **Photos:** private Storage bucket, object keys in the DB, 15-minute signed URLs
  per read (the `exercise-media` pattern). EXIF/GPS stripped server-side with
  `sharp` before upload.
- **Safety:** block + report ship in this initiative (App Store Guideline 1.2).
  A block severs any friendship and hides each user's content from the other.
- **Auth:** all routes live under `/api/` outside the public prefixes, so the
  existing dual-auth guard (`server/middleware/auth.ts`) covers them; routes add
  ownership/visibility checks on top.
- **Migrations:** new tables only (additive — safe against the shared DB).
  `DELETE /api/auth/me` must cascade every new row and remove the user's photos.

## Modules

| Module id | Responsibility | Depends on |
|---|---|---|
| `user-discovery` | Search users; minimal public profile (name, avatar, relationship status) | `blocking` |
| `blocking` | Block / unblock / list blocked; the `isBlockedEitherWay` check every other module uses | — |
| `friendships` | Request, accept, decline, cancel, remove; list friends + incoming/outgoing requests | `user-discovery`, `blocking` |
| `posts` | Create / edit / delete own posts; visibility; get one post; a user's profile posts | `friendships`, `blocking` |
| `feed` | `GET /api/feed` — friends' posts, cursor-paginated | `posts`, `friendships` |
| `post-photos` | Attach ≤4 photos per post; EXIF strip; private bucket + signed URLs | `posts` |
| `reactions` | Add / remove emoji reactions; per-emoji counts + "mine" on every post payload | `posts` |
| `workout-shares` | A post may reference one of the author's `COMPLETED` sessions (program or standalone). Rendered as text only — "Saul completed a workout from Arm Farm 2", or "Saul completed a workout" for a standalone — never the session's sets or data | `posts` |
| `reports` | Report a post or user with a reason; stored for moderation (no admin UI yet) | `posts`, `user-discovery` |

Build order: `blocking` → `user-discovery` → `friendships` → `posts` → `feed` →
`post-photos`, `reactions`, `workout-shares`, `reports`

Each module gets `docs/social/SPEC-<module-id>.md` and ships as its own PR.

## URL scheme (all modules)

| Resource | Routes |
|---|---|
| Users | `GET /api/users/search?q=` · `GET /api/users/:id` · `GET /api/users/:id/posts` |
| Blocks | `GET /api/blocks` · `POST /api/blocks` `{ userId }` · `DELETE /api/blocks/:userId` |
| Friend requests | `GET /api/friend-requests?direction=incoming\|outgoing` · `POST /api/friend-requests` `{ userId }` · `POST /api/friend-requests/:id/accept` · `DELETE /api/friend-requests/:id` (decline or cancel) |
| Friends | `GET /api/friends` · `DELETE /api/friends/:userId` |
| Posts | `POST /api/posts` · `GET\|PATCH\|DELETE /api/posts/:id` |
| Feed | `GET /api/feed?cursor=&limit=` |
| Reactions | `PUT\|DELETE /api/posts/:id/reactions/:emoji` (URL-encoded) |
| Reports | `POST /api/reports` `{ postId? , userId?, reason, details? }` |

## Shared conventions (apply to every module spec)

- **Commands:** `npx nuxt prepare` once per worktree, then
  `npx vitest run <paths>` · `npx nuxi typecheck` · `npx nuxt build`.
  Migrations via the **prisma-db** subagent; final gate is **verify-app**.
- **Structure:** routes in `server/api/<resource>/…` with co-located
  `*.test.ts`; shared helpers in `server/utils/<name>.ts` (auto-imported);
  new Prisma models registered in the global mock in `vitest.setup.ts`.
- **Style:** the existing route shape — `defineRouteMeta` OpenAPI block,
  manual inline validation, `createError` with accurate status, `try/catch`
  that rethrows `statusCode` errors and logs everything else via
  `(event.context.logger ?? logger).error({ err, route }, …)` → generic 500.
- **Privacy rule:** a block is never disclosed. Wherever a block hides a user
  or post, respond exactly as if it did not exist (404 / omitted). Emails are
  never returned for anyone but the caller.
- **Testing:** TDD — failing Vitest unit test first, per route, covering
  happy path, validation 400s, 404s, ownership/visibility, block hiding, and
  the 500 path. Prisma is mocked.
- **Boundaries.** *Always:* additive migrations, `onDelete: Cascade` from
  `User` on every new table, ownership checks in the route. *Ask first:* any
  change to existing tables/routes beyond the ones a spec names, any new
  dependency other than `sharp`. *Never:* expose another user's email or
  workout data, trust a client-sent `userId` as the actor, disclose a block.
- **Docs:** each PR extends `docs/API_CONTRACT_SOCIAL.md` (the iOS contract).
