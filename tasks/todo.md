# Social — task list

Commands: `npx vitest run <paths>` · `npx nuxi typecheck` · `npx nuxt build`.

## PR 1 — `blocking` (branch `feat/social-blocking`)

- [x] **T1: `UserBlock` model + migration** (S)
  - Acceptance: model per SPEC-blocking; additive migration SQL; `userBlock`
    in the `vitest.setup.ts` prisma mock; `prisma generate` clean.
  - Verify: `npx prisma validate`; typecheck.
  - Files: `prisma/schema.prisma`, `prisma/migrations/<ts>_user_blocks/migration.sql`, `vitest.setup.ts`
- [x] **T2: block helpers** (S) — depends T1
  - Acceptance: `isBlockedEitherWay`, `blockedUserIds` correct in both directions.
  - Verify: `npx vitest run server/utils/blocks.test.ts`
  - Files: `server/utils/blocks.ts` (+ test)
- [x] **T3: `POST /api/blocks`** (S) — depends T1
  - Acceptance: 201 new, 200 idempotent, 400 self/invalid, 404 unknown, 500 path.
  - Verify: `npx vitest run server/api/blocks`
  - Files: `server/api/blocks/index.post.ts` (+ test)
- [x] **T4: `GET /api/blocks` + `DELETE /api/blocks/:userId`** (S) — depends T1
  - Acceptance: list only caller's blocks, newest first, no email; delete is
    idempotent 204.
  - Verify: `npx vitest run server/api/blocks`
  - Files: `server/api/blocks/index.get.ts`, `[userId].delete.ts` (+ tests), `server/utils/public-user.ts`
- [x] **T5: contract doc + verify-app** — depends T2–T4
  - Files: `docs/API_CONTRACT_SOCIAL.md`

### Checkpoint: blocking
- [x] verify-app passes
- [x] PR opened (#131)
- [x] migration applied (2026-09-29, via session pooler)

## PR 2 — `user-discovery` (branch `feat/social-user-discovery`)

- [x] **T6: `rateLimitByKey`** (XS) — `server/utils/rate-limit.ts` (+ test)
- [x] **T7: `GET /api/users/search`** (S) — depends T2, T6
  - Acceptance: every SPEC-user-discovery search criterion.
- [x] **T8: `GET /api/users/:id`** (S) — depends T2
- [x] **T9: contract doc + verify-app**

### Checkpoint: user-discovery
- [x] verify-app passes
- [x] PR opened (#132)

## PR 3 — `friendships` (branch `feat/social-friendships`)

- [x] Spec approved (`docs/social/SPEC-friendships.md`)
- [x] **F1: `Friendship` model + migration** (S)
  - Acceptance: model per spec; migration adds the two raw `CHECK`s; `friendship`
    mock + helper globals in `vitest.setup.ts`; not applied to the DB.
  - Verify: `npx prisma validate`; typecheck.
- [x] **F2: friend helpers** (S) — depends F1
  - Acceptance: `orderedPair`, `areFriends`, `relationshipsWith`, `friendsOf`
    correct for every state and both orderings.
  - Verify: `npx vitest run server/utils/friends.test.ts`
- [x] **F3: `POST /api/friend-requests`** (M) — depends F2
  - Acceptance: 201 new · 200 idempotent · crossed request auto-accepts ·
    409 friends · 404 unknown/blocked · 400 self · P2002 race · rate limit.
  - Verify: `npx vitest run server/api/friend-requests`
- [x] **F4: list / accept / cancel-or-decline requests** (M) — depends F2
  - Files: `friend-requests/index.get.ts`, `[id]/accept.post.ts`, `[id].delete.ts` (+ tests)
- [x] **F5: `GET /api/friends` + `DELETE /api/friends/:userId`** (S) — depends F2
- [x] **F6: wire into shipped routes** (M) — depends F2
  - Acceptance: block deletes the pair's friendship in one transaction;
    search + profile carry `relationship` (+ `requestId` when pending).
  - Files: `blocks/index.post.ts`, `users/search.get.ts`, `users/[id].get.ts` (+ tests)
- [x] **F7: contract doc + verify-app**

### Checkpoint: friendships
- [x] verify-app passes
- [x] PR opened (#133)
- [x] migration applied (2026-09-29, via session pooler)

## PR 4 — `posts` (branch `feat/social-posts`)

- [x] Spec approved (`docs/social/SPEC-posts.md`)
- [x] **P1: `Post` model + migration** (S)
  - Acceptance: model per spec; additive migration; `post` mock in `vitest.setup.ts`; not applied.
- [x] **P2: post helpers** (S) — depends P1
  - Acceptance: `canViewPost` covers every row of the visibility rule; `parsePageQuery`
    matches `GET /api/history` 400s exactly; `toPost` sets `isMine`.
  - Verify: `npx vitest run server/utils/posts.test.ts`
- [x] **P3: `POST /api/posts`** (S) — depends P2
- [x] **P4: `GET` / `PATCH` / `DELETE /api/posts/:id`** (M) — depends P2
  - Acceptance: 404 for anything not visible (GET) or not owned (PATCH/DELETE);
    `editedAt` only on a real change.
- [x] **P5: `GET /api/users/:id/posts`** (M) — depends P2
  - Acceptance: own → all; friend → both; stranger → PUBLIC; blocked/unknown → 404;
    keyset page with the `id` tiebreak.
- [x] **P6: contract doc + auth guard cases + verify-app**

### Checkpoint: posts
- [x] verify-app passes
- [x] pushed to PR #134
- [x] migration applied (2026-09-30, via session pooler)

## ⚠️ Pivot (2026-09-30): friends → follows

PR 3 (`friendships`) is superseded and PR 4 (`posts`) is reworked; see
`docs/social/SPEC-follows.md`. The old feed draft was discarded, and `feed`
gets a new, simpler spec after `follows`.

## PR 5 — `follows` (branch `feat/social-follows`) — breaking, `feat!`

- [x] Spec approved (`docs/social/SPEC-follows.md`)
- [x] **W1: schema + migration** (S): enums, `User.profileVisibility` (default
  PRIVATE), `Follow` + CHECK; `@deprecated` markers on the friend/visibility
  objects; mocks. Not applied.
- [x] **W2: helpers** (S): `user-pair.ts` (move `orderedPair`, `withPairLock`),
  `follows.ts` (`isFollowing`, `followStatesWith`, `followingIdsOf`).
- [x] **W3: `/api/following` + `/api/followers` routes** (M): follow (lock +
  block check, PUBLIC→accepted / PRIVATE→pending, idempotent, rate limit),
  unfollow/cancel, lists, remove follower.
- [x] **W4: `/api/follow-requests` routes** (M): list, accept (lock, guarded),
  decline/cancel.
- [x] **W5: profile privacy** (S): `PATCH /api/auth/me` optional fields +
  `profileVisibility`; going public auto-accepts in one transaction; `GET` returns it.
- [x] **W6: posts rework** (M): `canViewPostsBy`; payload drops `visibility`;
  body-only create/edit; profile posts 403 `profile_private`.
- [x] **W7: shipped-module changes** (M): block deletes follows both ways;
  search/profile `Relationship` + counts; `PublicUser.profileVisibility`.
- [x] **W8: remove friends** (M): delete `/api/friend-requests*`, `/api/friends*`,
  `friends.ts` + tests; grep finds no friend references outside deprecated schema.
- [x] **W9: contract rewrite + auth guard cases + verify-app full suite**

### Checkpoint: follows
- [x] verify-app passes
- [x] migration applied (2026-09-30, via session pooler; FOR SHARE probe passed)
- [x] PR opened (#135)

## PR 6 — `feed` (branch `feat/social-feed`; #135 merged, now on main)

- [x] Spec approved (`docs/social/SPEC-feed.md`)
- [x] **FD1: `GET /api/feed`** (S): own + accepted followees' posts, newest first,
  History pagination; `isMine` on own posts.
  - Verify: `npx vitest run server/api/feed.get.test.ts`
- [x] **FD2: auth guard case + contract "Feed" section + verify-app** (S)

### Checkpoint: feed
- [x] verify-app passes
- [x] PR opened (#136, merged)

## PR 7 — `friendships-removal` (branch `chore/social-friendships-removal`)

- [x] Precondition: #135 (`8fff1a4`) is the live production deployment (Vercel, 2026-09-30)
- [x] Precondition: 0 `Friendship` / 0 `Post` rows; no code references
- [x] Schema change + guarded drop migration `20260930160000_drop_friendships`
- [x] verify-app
- [x] PR opened (#137, merged)
- [x] Applied 2026-09-30 at the user's explicit request (after the first attempt was blocked by the permission check)
- [x] Post-apply: status up to date, no drift, all four objects gone (`Follow` intact), production health 200 + social routes 401

## PR 8 — `post-photos` (branch `feat/social-post-photos`; #137 merged, now on main)

- [x] Spec approved (`docs/social/SPEC-post-photos.md`)
- [x] **PH1: add `sharp`** (XS): the one agreed new dependency.
- [x] **PH2: processing pipeline** (S): `processPostPhoto` (decode-sniff, pixel
  limit, rotate, strip, resize, JPEG); tests on **real image bytes**, including
  GPS EXIF removed and an orientation fix.
- [x] **PH3: `PostPhoto` model + migration + CHECK + mocks** (S). Not applied.
- [x] **PH4: signing + storage helpers** (S): `signPostPhotos` (one storage call
  per response), `removePostPhotoObjects` (best-effort, logged).
- [x] **PH5: `POST /api/post-photos`** (M): multipart, 413/415/400, rate limit,
  24 h sweep of the caller's unattached uploads.
- [x] **PH6: posts integration** (M): create with `photoIds` (atomic, guarded
  attach, photo-only posts), `photos` + `photosExpireAt` on every post route,
  delete removes objects.
- [x] **PH7: account deletion removes photo objects** (S).
- [x] **PH8: contract + auth guard cases + verify-app** (S).

### Checkpoint: post-photos
- [x] verify-app passes (sharp externalized + traced; lockfile has linux-x64)
- [x] PR opened (#138)
- [x] Bucket created by the user (2026-10-01); verified private, 4 MB, `image/jpeg` only, no storage policies
- [x] Migration applied (2026-10-01, before merge — code reads `PostPhoto` on every post route); status up to date, no drift, corrected CHECK live, sweep SQL probed (rolled back)
- [x] Merge #138 (`45cdad3`, live in production 2026-10-01)
- [x] Real-photo check, **local dev server against the real DB + bucket** (2026-10-01; the user
  chose this over reading the production JWT secret): GPS-tagged 3.4 MB JPEG → stored
  1536×2048 upright, **no APP segments** (no EXIF/GPS/ICC/XMP); signed URL works, public URL
  refused; post delete removed the object; no test rows left.
- [ ] sharp-on-Vercel proof: the first real iOS upload (watch its `POST /api/post-photos` log)

## PR 9 — `reactions` (branch `feat/social-reactions`)

- [x] Spec approved (`docs/social/SPEC-reactions.md`), incl. who-reacted + cap 10
- [x] **R0: photo test metadata check** (XS): replace the whole-file GPS byte scan with a
  JPEG APP-segment walk (carried over from the post-photos check).
- [x] **R1: `PostReaction` model + migration + mocks** (S). Not applied.
- [x] **R2: reaction helpers** (S): `parseReactionEmoji` (one RGI emoji, `❤`→`❤️`),
  `reactionSummaries` (blocked-aware counts + mine, one page in 3 queries),
  `requireVisiblePost`.
- [x] **R3: `reactions` on every Post payload** (S) via `toPostPayloads`.
- [x] **R4: `PUT …/reactions/:emoji`** (M): idempotent, cap 10 under a lock, P2002 race, rate limit.
- [x] **R5: `DELETE …/reactions/:emoji`** (S): own only, idempotent 204.
- [x] **R6: `GET …/reactions/:emoji`** (M): who reacted, newest first, blocked excluded,
  follow state, `cursorId` paging.
- [x] **R7: contract + auth guard cases + verify-app** (S).

### Checkpoint: reactions
- [x] verify-app passes
- [ ] PR opened
- [ ] Migration applied (BEFORE merge: every post route reads `PostReaction`)

## Later PRs (spec written when reached)

- [ ] `workout-shares` · [ ] `reports`
