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
- [ ] migration applied

## Later PRs (spec written when reached)

- [ ] `feed` · [ ] `post-photos` ·
      [ ] `reactions` · [ ] `workout-shares` · [ ] `reports`
