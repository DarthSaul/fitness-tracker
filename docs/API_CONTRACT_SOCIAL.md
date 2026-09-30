# API contract — social

Audience: the native iOS client. Interactive reference: `/api/docs` (Scalar).
Design and roadmap: [`docs/social/CAPABILITY_MAP.md`](social/CAPABILITY_MAP.md).
This document grows one section per module as each ships.

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
interface PublicUser { id: string; name: string | null; avatarUrl: string | null }
```

## Finding users

| Action | Route | Success |
|---|---|---|
| Search | `GET /api/users/search?q=` | `200 { users: (PublicUser & Relationship)[] }`, at most 20, ordered by name |
| Profile | `GET /api/users/:id` | `200 PublicUser & Relationship` |

```ts
type Relationship =
  | { relationship: 'self' | 'none' | 'friends' }
  | { relationship: 'request_sent' | 'request_received'; requestId: string }
```

`requestId` lets a profile screen accept (`request_received`) or cancel
(`request_sent`) without another lookup.

- `q` is trimmed and must be 2–100 characters (`400` otherwise).
- A `q` containing `@` matches an email **exactly** (case-insensitive) — type
  the whole address; partial emails find nobody. Anything else matches any
  part of the name, case-insensitive.
- Results never include the caller or anyone blocked in either direction.
- Search is limited to 30 requests per minute per user (`429`) — debounce
  as-you-type search on the client (~300 ms).
- Profile `404`s for an unknown user **and** for a blocked one; the caller's
  own id works.

## Posts

```ts
interface Post {
  id: string
  author: PublicUser
  body: string                        // 1–2,000 characters
  visibility: 'PUBLIC' | 'FRIENDS'
  createdAt: string
  editedAt: string | null             // non-null → show "Edited"
  isMine: boolean
}
```

| Action | Route | Success |
|---|---|---|
| Create | `POST /api/posts` — `{ body, visibility? }` | `201 Post` |
| Get one | `GET /api/posts/:id` | `200 Post` |
| Edit my post | `PATCH /api/posts/:id` — `{ body?, visibility? }` | `200 Post` |
| Delete my post | `DELETE /api/posts/:id` | `204` |
| A user's posts | `GET /api/users/:id/posts?limit=&before=&beforeId=` | `200 { posts: Post[] }`, newest first |

**Who can see a post:**
- The author can always see it.
- Anyone else needs no block in either direction, **and** the post to be
  `PUBLIC`, or `FRIENDS` with the two being friends right now.
- Everything else is `404`, the same as a post that doesn't exist.

Unfriending, re-friending and changing a post's visibility all take effect on
the next request.

- **Visibility default:** `visibility` defaults to **`FRIENDS`** when omitted.
  Send `PUBLIC` explicitly to share with everyone.
- **Profile lists:** a user's profile list shows everything on your own
  profile, `PUBLIC` and `FRIENDS` for a friend, and `PUBLIC` only otherwise.
  It is `404` for an unknown or blocked user.
- **Editing:** only the author can edit or delete. Anyone else, friends
  included, gets `404`. An edit that changes nothing leaves `editedAt`
  untouched.
- **Paging** works like `GET /api/history`:
  - `limit` defaults to 20 and is clamped to 1–50.
  - For the next page, send `before` (that post's `createdAt`) and `beforeId`
    (its `id`) from the **last** post of the previous page, together.
  - A page shorter than `limit` is the end.
- **Errors:**
  - `400` for a body that is empty, whitespace or over 2,000 characters; a
    visibility other than `PUBLIC` or `FRIENDS`; a PATCH with neither field;
    or bad paging parameters.
  - `429` after 30 new posts in an hour.

## Friends

```ts
interface FriendRequest {
  id: string
  user: PublicUser                 // always the other person
  direction: 'incoming' | 'outgoing'
  createdAt: string
}
type Friend = PublicUser & { friendsSince: string }
```

| Action | Route | Success |
|---|---|---|
| Send a request | `POST /api/friend-requests` — `{ userId }` | `201 FriendRequest`; see below for `200` |
| List pending requests | `GET /api/friend-requests?direction=incoming\|outgoing` | `200 { requests: FriendRequest[] }`, newest first; default `incoming` |
| Accept | `POST /api/friend-requests/:id/accept` | `200 { friend: Friend }` |
| Cancel (sent) or decline (received) | `DELETE /api/friend-requests/:id` | `204` |
| List friends | `GET /api/friends` | `200 { friends: Friend[] }`, by name, nameless last |
| Remove a friend | `DELETE /api/friends/:userId` | `204`, also when not friends |

Sending a request — the response depends on what already exists:

| Existing state | Response |
|---|---|
| Nothing | `201 FriendRequest` (outgoing) |
| I already requested them | `200` the same `FriendRequest` — safe to retry |
| **They** already requested me | Their request is accepted: `200 { friend: Friend }`. Tell the two apart by the `friend` key. |
| Already friends | `409` |
| Unknown **or** blocked user | `404` (indistinguishable) |

Errors elsewhere: `400` missing id / requesting yourself / bad `direction` ·
`404` on accept or delete when the request isn't pending, isn't yours to act
on, or is gone (only the recipient can accept; either side can delete) ·
`429` after 30 requests per hour.

Behaviour the client can rely on:

- A decline is silent: the request disappears from the sender's outgoing
  list, and either user may request again.
- Removing a friend works from either side and takes effect immediately.
  Once the feed ships, their posts are gone from the next feed fetch, and
  becoming friends again restores them, including older posts.
- You can only list your own friends.

## Blocking

| Action | Route | Success |
|---|---|---|
| List users I blocked | `GET /api/blocks` | `200 { users: (PublicUser & { blockedAt: string })[] }`, newest first |
| Block a user | `POST /api/blocks` — `{ userId }` | `201 { userId, blockedAt }`; `200` with the existing block if already blocked |
| Unblock a user | `DELETE /api/blocks/:userId` | `204`, also when no block existed |

Errors: `400` missing `userId` or blocking yourself · `404` unknown user
(`POST` only) · `500` generic.

Behaviour the client can rely on:

- Both users may block each other independently; each sees only their own
  blocks in `GET /api/blocks`.
- Blocking also removes any friendship or pending friend request between the
  two users. Unblocking never restores it.
