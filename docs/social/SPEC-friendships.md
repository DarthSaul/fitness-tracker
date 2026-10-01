# Spec: friendships

> **Superseded (2026-09-30)** by [`SPEC-follows.md`](SPEC-follows.md). Mutual
> friends were replaced by one-way follows with profile-level privacy. This
> document records the design shipped in #133, which the `follows` PR removes.
> Its tables are dropped by `friendships-removal`.

Module of [CAPABILITY_MAP.md](CAPABILITY_MAP.md). Shared commands, structure,
style, testing and boundaries are defined there.

## Objective

Let users request, accept, decline and cancel friend requests, list their
friends, and remove a friend. The friendship graph is what `feed` and `posts`
(`FRIENDS` visibility) filter on, so an accepted row must mean "friends now"
and nothing else.

## Data model

One row per pair of users, in either state. Accepting updates the row;
removing, declining and cancelling delete it. That is what makes the feed rule
work with no extra bookkeeping: unfriend → the row is gone → the next feed
fetch excludes them; re-friend → a new `ACCEPTED` row → the next fetch includes
them (and their older posts).

```prisma
enum FriendshipStatus {
  PENDING
  ACCEPTED
}

model Friendship {
  id          String           @id @default(cuid())
  userLowId   String           // the pair, sorted: userLowId < userHighId
  userHighId  String
  requesterId String           // one of the two
  status      FriendshipStatus @default(PENDING)
  createdAt   DateTime         @default(now())
  acceptedAt  DateTime?

  userLow  User @relation("FriendshipsAsLow", fields: [userLowId], references: [id], onDelete: Cascade)
  userHigh User @relation("FriendshipsAsHigh", fields: [userHighId], references: [id], onDelete: Cascade)

  @@unique([userLowId, userHighId])
  @@index([userHighId, status])
}
```

Storing the pair in a fixed order makes "one row per unordered pair" an
ordinary Prisma `@@unique`, so A→B and B→A can never coexist and every lookup
by pair is a `findUnique`. `orderedPair(a, b)` in `server/utils/friends.ts` is
the only place that sorts. Raw SQL `CHECK`s in the migration (Prisma can't
express them):

- `"userLowId" < "userHighId" COLLATE "C"` — byte order, matching JavaScript's
  string comparison, so the DB and `orderedPair` can never disagree. It also
  rules out self-friendship.
- `"requesterId" IN ("userLowId", "userHighId")`.

Additive migration only.

**Design choice (2026-09-29):** one row per pair, not two mirrored rows. Each
fact is stored once, so a half-written friendship is impossible; the cost is
that "my friends" probes two indexes (`userLowId`, `userHighId`) instead of
one, which is negligible at this scale. Move to mirrored rows only if feed
profiling ever shows the friend lookup as the bottleneck — the routes would
not change.

## Routes

Shapes:

```ts
interface FriendRequest {
  id: string
  user: PublicUser              // always the *other* party
  direction: 'incoming' | 'outgoing'
  createdAt: string
}
type Friend = PublicUser & { friendsSince: string }
```

### `POST /api/friend-requests` `{ userId }`

- 400 missing `userId` / self. 404 unknown user **or** blocked either way.
- No row → create `PENDING` → **201** `FriendRequest` (outgoing).
- Already `PENDING` from me → them → **200** with the existing request (idempotent).
- Already `PENDING` from them → me → **accept it** (mutual intent) → **200**
  `{ friend: Friend }`. Distinguish by shape — the response has `friend`
  instead of `id`/`direction`.
- Already `ACCEPTED` → **409** `Already friends`.
- A concurrent duplicate (P2002 on the pair `@@unique`) re-reads and applies
  the rules above.
- Rate-limited: `rateLimitByKey('friend-request:<userId>', 30, '1 h')`.

### `GET /api/friend-requests?direction=incoming|outgoing`

- Default `incoming`; any other value → 400. Pending only, newest first.
- 200 `{ requests: FriendRequest[] }`.

### `POST /api/friend-requests/:id/accept`

- Only the addressee, only while `PENDING`; otherwise 404.
- Sets `ACCEPTED` + `acceptedAt` → 200 `{ friend: Friend }`.

### `DELETE /api/friend-requests/:id`

- Requester (cancel) or addressee (decline), only while `PENDING`; otherwise 404.
- Deletes the row → 204. The requester is not told it was declined; the
  request just disappears from their outgoing list.

### `GET /api/friends`

- 200 `{ friends: Friend[] }`, ordered by name then id. Unpaginated (see Open
  questions). Only the caller's own friends — nobody can list someone else's.

### `DELETE /api/friends/:userId`

- Deletes the `ACCEPTED` row between the caller and `userId`, whichever
  direction it was requested in → 204. Idempotent (204 if not friends). Does
  not touch a `PENDING` row.

## Changes to shipped modules

- **`POST /api/blocks`** deletes any `Friendship` row between the pair (pending
  or accepted) in the same transaction as creating the block.
- **`GET /api/users/search`** and **`GET /api/users/:id`** add
  `relationship: 'self' | 'none' | 'friends' | 'request_sent' | 'request_received'`
  and, when pending, `requestId` — so a profile screen can accept or cancel
  without another lookup. Search resolves all results in one extra query.

## Helpers — `server/utils/friends.ts`

```ts
/** `{ userLowId, userHighId }` for the pair — the only place ids are sorted. */
export function orderedPair(a: string, b: string): { userLowId: string; userHighId: string }
/** True if `a` and `b` have an ACCEPTED friendship. */
export async function areFriends(a: string, b: string): Promise<boolean>
/** Relationship of `me` to each of `userIds`, in one query. */
export async function relationshipsWith(me: string, userIds: string[]): Promise<Map<string, Relationship>>
/** Prisma `where` fragment: "users who are ACCEPTED friends of `me`" — for the feed. */
export function friendsOf(me: string): Prisma.UserWhereInput
```

## Concurrency (added after PR #133 review)

A block and a friend request for the same pair could interleave. The request
checks for a block, the block is created and deletes the pair's (not yet
existing) row, and then the request inserts a `PENDING` row. The blocker could
then accept that request. A transaction on one side can't prevent this,
because the other side doesn't take part in it.

`withPairLock(a, b, fn)` serializes them. It runs `fn` in a transaction that
first takes `pg_advisory_xact_lock` on the sorted pair. The lock is
transaction-scoped, so it works through Supabase's transaction-mode pooler;
this was verified against the production URL.

- **Routes that take the lock:** block creation, request create (including
  the block check and a crossed accept), accept, and cancel/decline.
- **Routes that don't:** unfriend and unblock only remove rows, and neither
  can create a blocked-and-pending or blocked-and-friends state.

Serializing also removes the P2002/P2025 retry logic from
`POST /api/friend-requests`: two writes to the same pair can no longer
interleave.

## Out of scope

Friend suggestions, mutual-friend counts, viewing another user's friends,
notifications for requests (push triggers are a separate roadmap item),
following without mutual consent.

## Files

- `prisma/schema.prisma` + migration; `vitest.setup.ts` (`friendship` mock + helper globals)
- `server/utils/friends.ts` (+ test)
- `server/api/friend-requests/index.get.ts`, `index.post.ts`, `[id].delete.ts`, `[id]/accept.post.ts` (+ tests)
- `server/api/friends/index.get.ts`, `[userId].delete.ts` (+ tests)
- `server/api/blocks/index.post.ts`, `server/api/users/search.get.ts`, `[id].get.ts` (+ test updates)
- `docs/API_CONTRACT_SOCIAL.md`

## Success criteria

- [ ] A→B request, B accepts → both see each other in `GET /api/friends`.
- [ ] A→B then B→A → they become friends; no second row.
- [ ] Only B can accept; A or a third user gets 404.
- [ ] A can cancel, B can decline; afterwards either may request again.
- [ ] Remove works from either side regardless of who requested; re-request
      then accept yields a fresh `ACCEPTED` row.
- [ ] Requesting an existing friend → 409; requesting a blocked user (either
      direction) → 404, indistinguishable from an unknown user.
- [ ] Blocking a friend or pending requester deletes the row.
- [ ] Search and profile report the correct `relationship` for every state.
- [ ] 31st request in an hour → 429 when Upstash is configured.

## Decisions

1. **No friend cap, no pagination** on `GET /api/friends` for now; add
   pagination if a real account ever needs it.
2. **Crossed requests auto-accept** (B requests A while A→B is pending) — the
   common friend-request convention (e.g. Facebook). The alternative, a 409
   "they already requested you", adds a client round-trip for no benefit.
