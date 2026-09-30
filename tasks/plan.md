# Implementation Plan: Social

## Overview

Friends, posts with photos, emoji reactions and a friends-only feed, API-only.
Module boundaries, decisions, URL scheme and shared conventions live in
[`docs/social/CAPABILITY_MAP.md`](../docs/social/CAPABILITY_MAP.md); each
module has `docs/social/SPEC-<id>.md`. One PR per module, in build order.

## Architecture decisions

- Feed is fan-out-on-read: a join against current `ACCEPTED` friendships at
  query time, so unfriend/re-friend needs no backfill. Keyset pagination.
- Blocks are enforced by shared helpers (`server/utils/blocks.ts`) that every
  later module calls; a block always renders as "not found".
- Migrations are additive and hand-applied (the build does not run
  `prisma migrate deploy`); every new table cascades from `User`, so account
  deletion needs no route change until photos exist in Storage.
- Specs for later modules are written just-in-time, when the module is next.

## Task list

Tracked in [`tasks/todo.md`](todo.md).

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Shared prod DB migrated before code deploys | Low | New tables only; old code ignores them |
| Exact-email search as an account-existence oracle | Med | Per-user rate limit; exact match only |
| Feed query cost as friend counts grow | Low (now) | Composite index `Post(authorId, createdAt, id)`; revisit fan-out-on-write only at scale |
| `sharp` native binary on Vercel | Med | Verify in a preview deploy during `post-photos` |

## Open questions

None blocking. Later-module defaults (≤4 photos × 10 MB, 2,000-char body,
any single emoji) were proposed and not objected to.
