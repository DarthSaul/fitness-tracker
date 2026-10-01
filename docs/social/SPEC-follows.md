# Spec: follows

Module of [CAPABILITY_MAP.md](CAPABILITY_MAP.md). Shared commands, structure,
style, testing and boundaries are defined there.

## Objective

Replace mutual friends (#133) with one-way follows, and move privacy from each
post (#134) to each profile. This is a **breaking API change** (`feat!`):

- `/api/friend-requests*` and `/api/friends*` are removed.
- `Post.visibility` leaves the payload.
- `relationship` changes shape.

The iOS app has not been built against any of these, so they are removed
outright with no deprecation window (decision, 2026-09-30).

## Migration (expand / contract)

Production data on 2026-09-30: 7 users, **0** `Friendship`, **0** `Post`, **0**
`UserBlock` rows. There is nothing to backfill or convert.

1. **This PR (expand + switch).**
   - **Adds:** `User.profileVisibility`, the `Follow` table and their enums.
   - **Code:** the follow routes, the new visibility rule, and removal of all
     friend code.
   - **Keeps:** `Friendship`, `FriendshipStatus`, `Post.visibility` and
     `PostVisibility`, still in the schema but marked `@deprecated`.
     - Production still runs the #133/#134 code during rollout, and it reads
       them.
     - New code never reads or writes them; `Post.visibility`'s DB default
       fills new rows.
2. **`friendships-removal` (contract).** Once this PR is live in production, a
   separate PR drops those four. It is the only destructive migration in the
   initiative, and it ships alone.

**Down path for this PR's migration:** drop `Follow`, `User.profileVisibility`,
`FollowStatus` and `ProfileVisibility`. Nothing else depends on them. The
deprecated objects are untouched, so reverting the code restores #134
behaviour.

## Data model

```prisma
enum ProfileVisibility { PUBLIC PRIVATE }
enum FollowStatus      { PENDING ACCEPTED }

model User {
  // …
  profileVisibility ProfileVisibility @default(PRIVATE)
}

model Follow {
  id         String       @id @default(cuid())
  followerId String
  followeeId String
  status     FollowStatus
  createdAt  DateTime     @default(now())
  acceptedAt DateTime?

  follower User @relation("Following", fields: [followerId], references: [id], onDelete: Cascade)
  followee User @relation("Followers", fields: [followeeId], references: [id], onDelete: Cascade)

  @@unique([followerId, followeeId])
  @@index([followeeId, status])
}
```

- **One row per direction.** A→B and B→A are independent rows. The
  `@@unique` covers "who do I follow" (by `followerId`); the second index
  covers "who follows me" and incoming requests.
- **Raw SQL:** `CHECK ("followerId" <> "followeeId")`.
- **Existing users:** the 7 users get `PRIVATE` from the column default, per
  "default users to private profiles".

## The visibility rule

A viewer can see **a user's posts** if **any** of these holds:

1. the viewer is that user; or
2. no block exists between them (either direction) **and**
   - the profile is `PUBLIC`, or
   - the viewer's follow of them is `ACCEPTED`.

`canViewPostsBy(viewerId, author: { id, profileVisibility })` in
`server/utils/posts.ts` replaces `canViewPost` and is the only
implementation. It reads the author's current visibility and follow state, so
the following all take effect on the next request:

- going private,
- being removed as a follower,
- unfollowing.

How each route applies it:

| Route | Rule fails |
|---|---|
| `GET /api/posts/:id` | `404`: a single post never reveals that it exists |
| `GET /api/users/:id/posts` | `403 { data: { code: 'profile_private' } }` |

The profile itself is still visible (see below), so the client already knows
the account is private and shows its lock screen. This 403 only reaches
Sentry if a client calls it anyway, which is a client bug worth seeing. A
blocked or unknown user is still `404`.

## Routes

`PublicUser` gains `profileVisibility`, so a client can label the button
"Follow" or "Request" from any list. Everywhere, the follower is the
authenticated user.

### Following — `POST /api/following` `{ userId }`

- 400 missing / self. 404 unknown **or** blocked either way.
- The target is `PUBLIC`: an `ACCEPTED` row is created → **201**
  `{ status: 'following' }`.
- The target is `PRIVATE`: a `PENDING` row is created → **201**
  `{ status: 'requested', requestId }`.
- A row already exists → **200** with its current status (idempotent).
- The block check and the write run under `withPairLock`.
- Rate limit: `rateLimitByKey('follow:<userId>', 60, '1 h')`.

### `DELETE /api/following/:userId`

- Removes my follow of them, accepted **or** pending (so it also cancels a
  request). **204**, idempotent.

### `GET /api/following` · `GET /api/followers`

- `ACCEPTED` only, as `{ users: (PublicUser & { since: string })[] }`, newest
  first.
- Your own lists only.

### `DELETE /api/followers/:userId`

- Removes their accepted follow of me. **204**, idempotent. On a private
  profile, this is how you revoke someone's access.

### `GET /api/follow-requests?direction=incoming|outgoing`

- Pending rows as `{ requests: { id, user: PublicUser, direction, createdAt }[] }`,
  newest first. `direction` defaults to `incoming`.

### `POST /api/follow-requests/:id/accept`

- The followee only, while `PENDING`, otherwise 404.
- **200** `{ follower: PublicUser & { since } }`.
- Runs under `withPairLock`, with the update guarded on `PENDING`.

### `DELETE /api/follow-requests/:id`

- The followee declines, or the follower cancels, while `PENDING`, otherwise
  404. **204**. The requester is not told about a decline.

### Profile privacy — `PATCH /api/auth/me`

- Accepts `profileVisibility: 'PUBLIC' | 'PRIVATE'` alongside the existing
  `ptRoutineInWorkout`.
- **Both fields become optional**, with at least one required. Today
  `ptRoutineInWorkout` is required, and relaxing that is backward compatible.
- `GET /api/auth/me` and the PATCH response include `profileVisibility`.
- **`PRIVATE` → `PUBLIC`** runs as one transaction: the update, plus every
  `PENDING` request to me becomes `ACCEPTED`. It doesn't need the pair lock:
  it only updates existing rows, and a concurrent block's `DELETE` wins on the
  row lock.
- **`PUBLIC` → `PRIVATE`** leaves existing followers in place. Removing
  followers is `DELETE /api/followers/:userId`.

## Changes to shipped modules

- **Blocking (#131):** `POST /api/blocks` deletes follows in **both**
  directions, pending or accepted, under the pair lock, instead of the
  friendship.
- **Discovery (#132):**
  - Search and profile replace `relationship` with:
    ```ts
    type FollowState = 'none' | 'requested' | 'following'
    interface Relationship {
      isSelf: boolean
      outgoing: FollowState          // me → them
      incoming: FollowState          // them → me
      incomingRequestId: string | null // accept/decline from their profile
    }
    ```
    Search resolves this in one extra query, as before.
  - `GET /api/users/:id` adds `followerCount` and `followingCount`, which
    count accepted rows only.
- **Posts (#134):**
  - `POST /api/posts` and `PATCH /api/posts/:id` take `{ body }` only. A
    `visibility` key is ignored for compatibility: it isn't an error, and it
    isn't documented.
  - The payload loses `visibility`.
  - `GET /api/users/:id/posts` returns the user's posts or the 403 above, with
    no per-post filtering.
- **Friendships (#133):** every route, `server/utils/friends.ts` except the
  pieces below, and their tests are **deleted**:
  - `orderedPair` and `withPairLock` move to `server/utils/user-pair.ts`, since
    blocking and follows both need them.
  - `server/utils/follows.ts` gets `isFollowing(viewer, author)` (accepted),
    `followStatesWith(me, ids)` and `followingIdsOf(me)`. The feed uses the
    last one.

## Out of scope

- Viewing other users' follower and following lists (counts only, by
  decision).
- Close friends and lists.
- Notifications for follows and requests. Push triggers are a separate
  roadmap item.
- Suggested follows.
- The feed route itself, which is its own module, next.

## Success criteria

- [ ] Following a `PUBLIC` user → `following` at once; following a `PRIVATE`
      user → `requested` until they accept.
- [ ] A `PRIVATE` user's posts: visible to accepted followers and themselves.
      A pending requester or stranger gets 404 by id and 403 on the profile
      posts list.
- [ ] A `PUBLIC` user's posts are visible to anyone not blocked.
- [ ] Going private hides posts from non-followers on the next read; going
      public accepts every pending request.
- [ ] Removing a follower or unfollowing revokes access on the next read.
- [ ] A block deletes follows both ways; following a blocked user → 404.
- [ ] A new user is `PRIVATE`; existing users read as `PRIVATE`.
- [ ] Search and profile report `outgoing` / `incoming` / `incomingRequestId`
      correctly in every state; the profile shows accepted counts.
- [ ] No route, helper, test or doc still references friends, except the
      deprecated schema objects awaiting `friendships-removal`.
- [ ] 61st follow in an hour → 429 when Upstash is configured.
