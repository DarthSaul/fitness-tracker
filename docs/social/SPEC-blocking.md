# Spec: blocking

Module of [CAPABILITY_MAP.md](CAPABILITY_MAP.md). Shared commands, structure,
style, testing and boundaries are defined there.

## Objective

Let a user block another user so that neither sees the other anywhere in the
social surface, and the blocked user is never told. Required for App Store
Guideline 1.2. Other modules depend on the check helpers defined here.

## Data model

```prisma
model UserBlock {
  id        String   @id @default(cuid())
  blockerId String
  blockedId String
  createdAt DateTime @default(now())

  blocker User @relation("BlocksMade", fields: [blockerId], references: [id], onDelete: Cascade)
  blocked User @relation("BlocksReceived", fields: [blockedId], references: [id], onDelete: Cascade)

  @@unique([blockerId, blockedId])
  @@index([blockedId])
}
```

Additive migration only. Account deletion needs no change (cascade).

## Routes

- `GET /api/blocks` → 200 `{ users: (PublicUser & { blockedAt: string })[] }`,
  newest first. Only blocks **the caller made**.
- `POST /api/blocks` `{ userId }` → 201 `{ userId, blockedAt }`.
  - 400 missing/non-string `userId`, or blocking yourself.
  - 404 unknown user.
  - Already blocked → 200 with the existing row (idempotent, no 409).
  - Once `friendships` lands, it extends this route to delete any friendship
    or pending request between the pair in the same transaction.
- `DELETE /api/blocks/:userId` → 204. Idempotent: 204 even if no block existed.
  Unblocking does **not** restore a friendship.

## Helpers — `server/utils/blocks.ts`

```ts
/** True if either user has blocked the other. */
export async function isBlockedEitherWay(a: string, b: string): Promise<boolean>
/** Ids of every user the caller blocked or was blocked by — for `notIn` filters. */
export async function blockedUserIds(userId: string): Promise<string[]>
```

## Out of scope

Muting, block reasons, telling the blocked user they were blocked.

## Files

- `prisma/schema.prisma` + migration (via prisma-db subagent)
- `vitest.setup.ts` (register `userBlock` in the prisma mock)
- `server/api/blocks/index.get.ts`, `index.post.ts`, `[userId].delete.ts` (+ tests)
- `server/utils/blocks.ts` (+ test)

## Success criteria

- [ ] `isBlockedEitherWay` / `blockedUserIds` return correct results in both
      directions (search/profile hiding is verified in `user-discovery`).
- [ ] Blocking twice → one row, second call 200.
- [ ] Self-block → 400; unknown user → 404.
- [ ] B's `GET /api/blocks` does not reveal A's block.
- [ ] Unblock removes the row; a later block works again.
- [ ] Deleting either user removes the block row (cascade).
