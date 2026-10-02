# Capability Map: Social

Follows, posts with photos, emoji reactions, and a following feed. API-only
this round (native iOS + web both consume it); web UI is a later initiative.

## Pivot (2026-09-30): friends → follows

The initiative started on mutual **friends** with per-post `PUBLIC`/`FRIENDS`
visibility (#133, #134). It now uses one-way **follows** with **profile-level**
privacy, which simplifies both the feed and the post visibility rule. The old
model is superseded; see [`SPEC-follows.md`](SPEC-follows.md) for the migration
and [`SPEC-friendships.md`](SPEC-friendships.md) for the historical design.

## Decisions

- **Follows, not friends.**
  - Following is one-way.
  - Following a `PUBLIC` profile is accepted instantly.
  - Following a `PRIVATE` profile creates a request the owner approves.
- **Privacy is per profile, not per post.**
  - Every user is `PUBLIC` or `PRIVATE`, and defaults to **`PRIVATE`**.
  - Going public auto-approves pending requests.
- **Who can see a user's posts:**
  - The user themselves can.
  - Anyone else needs no block in either direction, **and** the profile to be
    `PUBLIC` or the viewer to be an accepted follower.
- **Feed** is your own posts plus those of everyone you follow (accepted),
  newest first.
  - It's computed on read, keyset-paginated like `GET /api/history`.
  - Unfollowing removes their posts from the next fetch; re-following
    restores them.
  - There's no global "discover" feed.
- **Lists:** every profile shows follower and following counts. Only your own
  followers and following can be listed.
- **Ownership:** only the author edits or deletes a post. Anyone who can see a
  post can react to it.
- **Reactions:** many distinct emojis per user per post (Slack-style), unique
  on `(postId, userId, emoji)`.
- **Photos:**
  - Stored in a private Storage bucket; the DB holds object keys.
  - Every read gets 15-minute signed URLs (the `exercise-media` pattern).
  - EXIF/GPS is stripped server-side with `sharp` before upload.
- **Safety:** block + report ship in this initiative (App Store Guideline 1.2).
  A block removes follows in both directions and hides each user from the
  other.
- **Concurrency:** block creation and every write that creates or advances a
  follow hold `withPairLock`, so "blocked" and "following / requested" can't
  both be true.
- **Auth:** all routes live under `/api/` outside the public prefixes, so the
  existing dual-auth guard (`server/middleware/auth.ts`) covers them; routes
  add ownership/visibility checks on top.
- **Migrations:** additive first; drops ship alone after the code that stopped
  using them is live (expand/contract, since production shares the database).
  `DELETE /api/auth/me` must cascade every new row and remove the user's photos.

## Modules

| Module id | Status | Responsibility | Depends on |
|---|---|---|---|
| `blocking` | ✅ #131 | Block / unblock / list; `isBlockedEitherWay` | — |
| `user-discovery` | ✅ #132 | Search users; public profile | `blocking` |
| ~~`friendships`~~ | ⛔ #133, superseded | Mutual friends; replaced by `follows` | — |
| `posts` | ✅ #134, reworked by `follows` | Create / edit / delete own posts; a user's posts | `follows`, `blocking` |
| `follows` | ✅ #135 | Follow / unfollow, requests, followers; profile visibility; the post visibility rule; removes friends | `user-discovery`, `blocking` |
| `feed` | ✅ #136 | `GET /api/feed`: own + followed users' posts | `follows`, `posts` |
| `friendships-removal` | ✅ #137 (applied) | Drop `Friendship`, `FriendshipStatus`, `Post.visibility`, `PostVisibility` | `follows` deployed |
| `post-photos` | ✅ #138 | ≤4 photos per post; EXIF strip; private bucket + signed URLs | `posts` |
| `reactions` | ✅ #139 | Emoji reactions; counts + "mine" on every post; who reacted | `posts` |
| `workout-shares` | ✅ #140 | A post may reference one of the author's `COMPLETED` sessions, rendered as text only, e.g. "Saul completed a workout from Arm Farm 2" (or "Saul completed a workout" for a standalone). Never the session's sets or data. | `posts` |
| `reports` | ⏭ [spec](SPEC-reports.md) approved | Report a post or user; snapshot stored for moderation; Sentry alert ([MODERATION.md](MODERATION.md)) | `posts`, `user-discovery` |

Build order: `follows` → `feed` → `friendships-removal` (own deploy) →
`post-photos`, `reactions`, `workout-shares`, `reports`

Each module gets `docs/social/SPEC-<module-id>.md` and ships as its own PR.

## URL scheme (all modules)

| Resource | Routes |
|---|---|
| Users | `GET /api/users/search?q=` · `GET /api/users/:id` · `GET /api/users/:id/posts` |
| Profile privacy | `PATCH /api/auth/me` `{ profileVisibility }` |
| Blocks | `GET /api/blocks` · `POST /api/blocks` `{ userId }` · `DELETE /api/blocks/:userId` |
| Following | `GET /api/following` · `POST /api/following` `{ userId }` · `DELETE /api/following/:userId` (unfollow or cancel) |
| Followers | `GET /api/followers` · `DELETE /api/followers/:userId` (remove a follower) |
| Follow requests | `GET /api/follow-requests?direction=incoming\|outgoing` · `POST /api/follow-requests/:id/accept` · `DELETE /api/follow-requests/:id` (decline or cancel) |
| Posts | `POST /api/posts` (optionally sharing a workout) · `GET\|PATCH\|DELETE /api/posts/:id` |
| Feed | `GET /api/feed?limit=&before=&beforeId=` (same pagination as `GET /api/history`) |
| Reactions | `PUT\|GET\|DELETE /api/posts/:id/reactions/:emoji` (URL-encoded) |
| Reports | `POST /api/reports` `{ postId \| userId, reason, details? }` |

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
- **Boundaries.** *Always:* additive migrations (drops only in their own later deploy), `onDelete: Cascade` from
  `User` on every new table, ownership checks in the route. *Ask first:* any
  change to existing tables/routes beyond the ones a spec names, any new
  dependency other than `sharp`. *Never:* expose another user's email or
  workout data, trust a client-sent `userId` as the actor, disclose a block.
- **Docs:** each PR extends `docs/API_CONTRACT_SOCIAL.md` (the iOS contract).
