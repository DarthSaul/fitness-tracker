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
- [ ] PR opened

## Later PRs (spec written when reached)

- [ ] `friendships` · [ ] `posts` · [ ] `feed` · [ ] `post-photos` ·
      [ ] `reactions` · [ ] `workout-shares` · [ ] `reports`
