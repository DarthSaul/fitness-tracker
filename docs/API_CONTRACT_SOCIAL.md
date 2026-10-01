# API contract — social

Audience: the native iOS client. Interactive reference: `/api/docs` (Scalar).
Design and roadmap: [`docs/social/CAPABILITY_MAP.md`](social/CAPABILITY_MAP.md).
This document grows one section per module as each ships.

## Breaking change (2026-09-30): friends → follows

The social model moved from mutual **friends** to one-way **follows**, and
privacy moved from each **post** to each **profile**. Nothing from the old
model remains in the API:

| Removed | Replaced by |
|---|---|
| `/api/friend-requests*` | `POST /api/following` + `/api/follow-requests*` |
| `/api/friends*` | `GET /api/following`, `GET /api/followers`, `DELETE /api/following/:userId`, `DELETE /api/followers/:userId` |
| `Post.visibility` (`PUBLIC` / `FRIENDS`) | `profileVisibility` (`PUBLIC` / `PRIVATE`) on the user, set via `PATCH /api/auth/me` |
| `relationship: 'self' \| 'none' \| 'friends' \| …` and `requestId` | `isSelf`, `outgoing`, `incoming`, `incomingRequestId` |

Every profile, existing and new, is `PRIVATE` until its owner makes it public.

## Rules that apply to every social route

- **Authenticated.** Bearer JWT or cookie session, like every other route.
  The acting user is always the authenticated one; a `userId` in a body or URL
  is only ever the *other* party.
- **Blocks are invisible.** If a block exists in either direction, the other
  user and their content behave exactly as if they did not exist (`404`, or
  omitted from lists). Never infer "you were blocked" from a response.
- **`PublicUser`** is the only shape other users appear in. It never contains
  an email.

```ts
interface PublicUser {
  id: string
  name: string | null
  avatarUrl: string | null
  profileVisibility: 'PUBLIC' | 'PRIVATE'   // label the button "Follow" vs "Request"
}

type FollowState = 'none' | 'requested' | 'following'
interface Relationship {
  isSelf: boolean
  outgoing: FollowState            // me → them
  incoming: FollowState            // them → me
  incomingRequestId: string | null // their pending request to me, to accept/decline
}
```

## Who can see a user's posts

- **The user themselves:** always.
- **Anyone else:** needs no block in either direction, **and** the profile to
  be `PUBLIC` or the viewer to be an **accepted** follower.

A pending request is not enough. The rule is evaluated on every request, so
going private, removing a follower or unfollowing takes effect immediately.

| Where | When the rule fails |
|---|---|
| `GET /api/posts/:id` | `404`, the same as a post that doesn't exist |
| `GET /api/users/:id/posts` | `403` with `data.code: 'profile_private'` |

The profile itself (`GET /api/users/:id`) is always visible, apart from
blocks. Show a lock screen from `profileVisibility === 'PRIVATE'` plus
`outgoing !== 'following'`, rather than waiting for the 403.

## Profile privacy

| Action | Route | Success |
|---|---|---|
| Read my settings | `GET /api/auth/me` | `200`, including `profileVisibility` |
| Change privacy | `PATCH /api/auth/me`, `{ profileVisibility: 'PUBLIC' \| 'PRIVATE' }` | `200` the updated settings |

- `PATCH /api/auth/me` now takes **either or both** of `ptRoutineInWorkout`
  and `profileVisibility`. `ptRoutineInWorkout` is no longer required. An
  empty body is `400`.
- **Going `PUBLIC` accepts every pending request** to you. **Going `PRIVATE`
  keeps your existing followers**; remove any you no longer want with
  `DELETE /api/followers/:userId`.

## Finding users

| Action | Route | Success |
|---|---|---|
| Search | `GET /api/users/search?q=` | `200 { users: (PublicUser & Relationship)[] }`, at most 20, ordered by name |
| Profile | `GET /api/users/:id` | `200 PublicUser & Relationship & { followerCount: number, followingCount: number }` |

- `q` is trimmed and must be 2–100 characters (`400` otherwise).
- A `q` containing `@` matches an email **exactly** (case-insensitive). Type
  the whole address; partial emails find nobody. Anything else matches any
  part of the name, case-insensitive.
- Results never include the caller or anyone blocked in either direction.
- Search is limited to 30 requests per minute per user (`429`). Debounce
  as-you-type search on the client (~300 ms).
- Profile `404`s for an unknown user **and** for a blocked one. The caller's
  own id works.
- **Counts:** `followerCount` and `followingCount` count accepted follows
  only. Only your **own** follower and following lists can be listed (below).

## Following

| Action | Route | Success |
|---|---|---|
| Follow | `POST /api/following`, `{ userId }` | see below |
| Unfollow, or cancel my request | `DELETE /api/following/:userId` | `204`, also when not following |
| Who I follow | `GET /api/following` | `200 { users: (PublicUser & { since: string })[] }`, newest first |
| My followers | `GET /api/followers` | the same shape, newest first |
| Remove a follower | `DELETE /api/followers/:userId` | `204`, also when not a follower |

Following, by the target's profile:

| State | Response |
|---|---|
| `PUBLIC` profile | `201 { status: 'following' }` |
| `PRIVATE` profile | `201 { status: 'requested', requestId }` |
| Already following / already requested | `200` with the same shape. Safe to retry. |
| Unknown **or** blocked user | `404` (indistinguishable) |

Errors: `400` missing `userId` or following yourself · `429` after 60 follows
in an hour.

## Follow requests

```ts
interface FollowRequest {
  id: string
  user: PublicUser                 // always the other person
  direction: 'incoming' | 'outgoing'
  createdAt: string
}
```

| Action | Route | Success |
|---|---|---|
| List pending | `GET /api/follow-requests?direction=incoming\|outgoing` | `200 { requests: FollowRequest[] }`, newest first; default `incoming` |
| Accept (I'm the followee) | `POST /api/follow-requests/:id/accept` | `200 { follower: PublicUser & { since: string } }` |
| Decline (followee) or cancel (requester) | `DELETE /api/follow-requests/:id` | `204` |

- **`404`:** on accept or delete when the request isn't pending, isn't yours
  to act on, or is gone. Only the followee can accept; either side can delete.
- **Bad `direction`:** `400`.
- **Declines are silent:** the request disappears from the requester's
  outgoing list, and they may request again.

## Posts

```ts
interface Post {
  id: string
  author: PublicUser
  body: string                        // 0–2,000 characters; empty only when there are photos
  createdAt: string
  editedAt: string | null             // non-null → show "Edited"
  isMine: boolean
  photos: { id: string; url: string; width: number; height: number }[]  // display order; [] if none
  photosExpireAt: string | null       // signed URLs stop working then — re-fetch; null if no photos
  reactions: { emoji: string; count: number; mine: boolean }[]  // most-used first; [] if none
}
```

| Action | Route | Success |
|---|---|---|
| Upload a photo | `POST /api/post-photos`, multipart field `photo` | `201 { id, width, height }` |
| Create | `POST /api/posts`, `{ body?, photoIds? }` | `201 Post` |
| Get one | `GET /api/posts/:id` | `200 Post` |
| Edit my post | `PATCH /api/posts/:id`, `{ body }` | `200 Post` |
| Delete my post | `DELETE /api/posts/:id` | `204` |
| A user's posts | `GET /api/users/:id/posts?limit=&before=&beforeId=` | `200 { posts: Post[] }`, newest first |

- **Photos: upload, then attach.**
  - **Prepare on the device:** downscale to ~2048 px on the long edge and
    encode as **JPEG** before uploading.
  - **Size:** the server accepts at most **4 MB** per upload (`413` over that),
    since Vercel caps a request at 4.5 MB. Only JPEG, PNG and WebP are
    accepted, checked from the bytes; HEIC is `415`.
  - **Processing:** every photo is decoded, turned upright, stripped of **all**
    metadata (EXIF, including GPS location), resized to ≤ 2048 px and stored
    as JPEG. Nothing the phone embedded is kept.
  - **Attaching:** pass up to **4** returned ids as `photoIds`, in display
    order. Each must be your own upload, not yet attached; otherwise the post
    is `400` and nothing is created. The upload response has no URL, so show
    your local copy until the post exists.
  - **Cleanup:** uploads never attached are deleted after 24 hours.
  - **After posting:** photos are fixed. `PATCH` edits only `body`, which may
    be emptied on a photo post. Deleting the post deletes its photos.
  - **URLs:** photo URLs are signed for 15 minutes. Re-fetch the post or
    page when `photosExpireAt` passes.
  - **Limits:** 60 uploads per hour.
- **Who sees a post:** the author's profile decides (see above). A post has
  no visibility of its own, and a `visibility` key in a request is ignored.
- **Editing:** only the author can edit or delete. Anyone else gets `404`,
  followers included. An edit that changes nothing leaves `editedAt` untouched.
- **Paging** works like `GET /api/history`:
  - `limit` defaults to 20 and is clamped to 1–50.
  - For the next page, send `before` (that post's `createdAt`) and `beforeId`
    (its `id`) from the **last** post of the previous page, together.
  - A page shorter than `limit` is the end.
- **Errors:**
  - `400` for a body that is empty or whitespace with no photos, a body over
    2,000 characters, more than 4 or duplicate `photoIds`, a photo that isn't
    your own unattached upload, or bad paging parameters.
  - `403 profile_private` and `404` as described above.
  - `429` after 30 new posts in an hour.

## Reactions

| Action | Route | Success |
|---|---|---|
| React | `PUT /api/posts/:id/reactions/:emoji` | `201 { reactions }`, or `200` if you already had it |
| Remove my reaction | `DELETE /api/posts/:id/reactions/:emoji` | `204`, also when you hadn't reacted |
| Who reacted | `GET /api/posts/:id/reactions/:emoji?limit=&before=&beforeId=` | `200 { users: (PublicUser & Relationship & { reactedAt: string; cursorId: string })[] }`, newest first |

- **`:emoji`:** exactly one emoji, URL-encoded (👍 → `%F0%9F%91%8D`). Skin tones,
  combined emoji (👨‍👩‍👧), flags and keycaps all work.
  - **Normalization:** a bare `❤` is stored as `❤️`, so both are the same
    reaction.
  - **Rejected:** anything else is `400`.
- **Several emoji per post:** you can add several *different* emoji to one
  post, each once, **up to 10**. The 11th is `409`.
- **Visibility:** you can react to any post you can see. A post you can't see
  is `404` on all three routes, the same as a missing post.
- **Counts and the who-reacted list always agree.**
  - **Blocked users:** both leave out anyone blocked in either direction.
  - **Your own reactions:** `mine` marks yours, and in the list you appear
    with `isSelf: true`.
- **Who-reacted rows** carry your follow state toward each person
  (`Relationship`), so the same Follow / Requested button works there.
- **Paging the list:**
  - **Next page:** send the last row's `reactedAt` as `before` and its
    `cursorId` as `beforeId`. Use `cursorId`, not the user's `id`.
  - **Limits:** `limit` defaults to 20 and is clamped to 1–50.
  - **End:** a page shorter than `limit` is the end.
- **Rate limit:** 300 reactions per hour (`429`).

## Feed

| Action | Route | Success |
|---|---|---|
| My feed | `GET /api/feed?limit=&before=&beforeId=` | `200 { posts: Post[] }`, newest first |

- **What's in it:** your own posts (`isMine: true`) plus the posts of everyone
  you follow with an **accepted** follow, whatever their profile visibility.
- **What isn't:** posts from users you've only *requested* to follow, and from
  `PUBLIC` profiles you don't follow.
- **Changes apply on the next fetch:** unfollowing someone, or being removed
  as their follower, drops their posts; following again brings them back,
  older posts included.
- **Paging** is identical to `GET /api/users/:id/posts` and
  `GET /api/history`, with the same `400`s.

## Blocking

| Action | Route | Success |
|---|---|---|
| List users I blocked | `GET /api/blocks` | `200 { users: (PublicUser & { blockedAt: string })[] }`, newest first |
| Block a user | `POST /api/blocks`, `{ userId }` | `201 { userId, blockedAt }`; `200` with the existing block if already blocked |
| Unblock a user | `DELETE /api/blocks/:userId` | `204`, also when no block existed |

Errors: `400` missing `userId` or blocking yourself · `404` unknown user
(`POST` only) · `500` generic.

Behaviour the client can rely on:

- Both users may block each other independently; each sees only their own
  blocks in `GET /api/blocks`.
- Blocking also removes every follow and follow request between the two
  users, in **both** directions. Unblocking never restores them.
