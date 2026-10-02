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
  username: string                          // show as "@username"; every account has one
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

## Usernames and bio

| Action | Route | Success |
|---|---|---|
| Set my username | `PATCH /api/auth/me`, `{ username }` | `200` the updated settings |
| Set or clear my bio | `PATCH /api/auth/me`, `{ bio }` (`null` or `""` clears) | `200` the updated settings |
| Check a username | `GET /api/users/username-available?username=` | `200 { available: true }` or `{ available: false, reason: 'invalid' \| 'reserved' \| 'taken' }` |

- **Every account has a username.**
  - New accounts get a generated one, `user_` plus 6 digits (`user_482193`),
    which the user can change at any time.
  - Existing accounts were backfilled the same way.
  - A username can be changed, but not removed.
- **Format:** 3–30 of `a–z`, `0–9`, `_` and `.`, with no leading, trailing or
  consecutive `.`.
  - **Normalized on save:** the input is trimmed, a leading `@` is dropped and
    it's lowercased, so `@SaulG` is saved as `saulg`.
  - **Reserved names**, such as `admin`, `support` and `drdumbbell`, can't be
    taken.
- **Errors on `PATCH`:**
  - `400`: an invalid or reserved username, `null`, or a bio over 100 code
    points.
  - `409 'Username taken'`.
- **The availability check** normalizes its input the same way, so validate
  as the user types. Your own current username reports `available: true`.
  Debounce it; it's limited to 60 a minute.
- **Bio:** up to **100 Unicode code points**, which is what `char_length`
  counts in the database. It's trimmed, and a blank bio is stored as no bio.
  - **Counting:** a plain letter or a single-code-point emoji (💪) counts
    once. A combined emoji counts as all its code points: a ZWJ family
    (👨‍👩‍👧) is 5, a flag (🇬🇧) is 2, and a skin-tone emoji (👍🏽) is 2.
  - **Character counter:** count code points to match the server, which is
    `bio.unicodeScalars.count` in Swift.
  - **Where it shows:** only on the profile (`GET /api/users/:id`) and in
    `GET /api/auth/me`, not in `PublicUser`.
  - **Who sees it:** anyone who can see the profile.
- **`GET /api/auth/me`** now also returns `username` and `bio`.

## Profile stats

```ts
interface ProfileStats {
  activeProgram: { name: string } | null  // the active program's name only
  completedWorkoutCount: number | null    // completed program + standalone workouts
}
```

| Action | Route | Success |
|---|---|---|
| See them | `GET /api/users/:id` | the two fields above, alongside the profile |
| My settings | `GET /api/auth/me` | includes `showActiveProgram` and `showWorkoutCount` |
| Change them | `PATCH /api/auth/me`, `{ showActiveProgram?: boolean, showWorkoutCount?: boolean }` | `200` the updated settings |

- **Two opt-out settings,** both **on** by default. Each controls one field,
  and either can be turned off at any time:
  - `showActiveProgram` controls `activeProgram`,
  - `showWorkoutCount` controls `completedWorkoutCount`.
- **Who sees them:** the same people who can see the user's posts. That's
  anyone not blocked, for a `PUBLIC` profile, and accepted followers, for a
  `PRIVATE` one.
- **You always see your own** values, whatever your settings, so you can
  preview your profile.
- **`null` means "don't show it".** It covers a setting that's off, a viewer
  who can't see the posts, or no active program, and the cases are
  deliberately indistinguishable. Hide the row; don't render `null` as "0" or
  "None".
- **`0` is a real value.** `completedWorkoutCount: 0` means the count is
  visible and the user hasn't completed a workout yet, so show "0". Hide the
  workout-count row **only** when the field is `null`.
- **Nothing else is exposed.** There's no week or day, progress, dates or
  breakdown: workouts stay private ([ADR 001](social/ADR-001-workouts-always-private.md)).
  `PATCH` with a non-boolean is `400`.

## Finding users

| Action | Route | Success |
|---|---|---|
| Search | `GET /api/users/search?q=` | `200 { users: (PublicUser & Relationship)[] }`, at most 20; an exact username match first, then by name |
| Profile | `GET /api/users/:id` | `200 PublicUser & Relationship & ProfileStats & { bio: string \| null, followerCount: number, followingCount: number }` |

- **Length:** `q` is trimmed, and a leading `@` (marking a username) is
  dropped. It must then be 2–100 characters (`400` otherwise).
- **Usernames and names:** `saul` and `@saul` both match usernames that
  **start with** "saul" and names that **contain** it, case-insensitive. An
  exact username match always comes first.
- **Email:** a `q` that still contains `@` after that matches an email
  **exactly**, case-insensitive. Type the whole address; partial emails find
  nobody.
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
  body: string                        // 0–2,000 characters; empty only with photos or a shared workout
  createdAt: string
  editedAt: string | null             // non-null → show "Edited"
  isMine: boolean
  photos: { id: string; url: string; width: number; height: number }[]  // display order; [] if none
  photosExpireAt: string | null       // signed URLs stop working then — re-fetch; null if no photos
  reactions: { emoji: string; count: number; mine: boolean }[]  // most-used first; [] if none
  workout: { programName: string | null } | null  // a shared workout; see "Sharing a workout"
}
```

| Action | Route | Success |
|---|---|---|
| Upload a photo | `POST /api/post-photos`, multipart field `photo` | `201 { id, width, height }` |
| Create | `POST /api/posts`, `{ body?, photoIds?, workoutSessionId? \| standaloneSessionId? }` | `201 Post` |
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
- **Sharing a workout.**
  - **What it shows:** text only. Render `workout` as "<author name> completed
    a workout from <programName>", or "<author name> completed a workout" when
    `programName` is `null` (a standalone workout). `workout: null` means the
    post shares nothing. The wording is the app's, so it can be localized.
  - **What it never shows:** sets, weights, notes, week/day or duration. Only
    the program's name leaves the server.
  - **Creating:** pass the session's id from `GET /api/history`. A `PROGRAM`
    row's id goes in `workoutSessionId`, a `STANDALONE` row's in
    `standaloneSessionId`, and never both. The text may be empty, and photos
    may be attached too.
  - **Rules:** it must be your own `COMPLETED` workout, and each one can be
    shared once. A second share is `409 'Workout already shared'`, so a double
    tap can't post twice.
  - **After posting:** the share is fixed, and `PATCH` may empty its text. The
    line is kept as posted: deleting the workout or renaming the program
    doesn't change it.
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
  - `400` for both session ids at once, or a blank one.
  - `403 profile_private` and `404` as described above.
  - `404 'Workout not found'` when the session isn't yours or doesn't exist.
  - `409 'Workout is not completed'` and `409 'Workout already shared'`.
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

## Reporting

| Action | Route | Success |
|---|---|---|
| Report a post | `POST /api/reports`, `{ postId, reason, details? }` | `201 { id }`; `200 { id }` if you already reported it |
| Report a user | `POST /api/reports`, `{ userId, reason, details? }` | `201 { id }`; `200 { id }` if you already reported them |

```ts
type ReportReason =
  | 'SPAM' | 'HARASSMENT' | 'HATE' | 'SEXUAL_CONTENT'
  | 'VIOLENCE' | 'SELF_HARM' | 'IMPERSONATION' | 'OTHER'
```

- **Reasons:** show them in this order; the server rejects anything else.
  `details` is optional free text, up to 1,000 characters, for any reason.
- **Report, then offer Block.** Blocking someone hides their posts from you,
  and a post you can't see can't be reported. So the report sheet should
  submit the report first and then offer to block the author. A **user** you
  have already blocked can still be reported.
- **What gets kept:** a copy of the post's text (or the user's name and
  avatar) at the moment you report. Editing or deleting the post afterwards
  doesn't remove the report.
- **Reporting twice** returns `200` with the first report's id and changes
  nothing. Treat `200` and `201` the same: show "Thanks — we'll review this."
- **Nothing visible changes** for the reporter or the reported user. The
  report goes to a moderator.
- **Errors:**
  - `400`: not exactly one of `postId` / `userId`, an unknown `reason`,
    `details` over 1,000 characters, or reporting yourself or your own post.
  - `404`: a post you can't see, or a user who doesn't exist or has blocked
    you. A report never reveals a hidden post or a block.
  - `429` after 20 report requests in an hour, repeats included. A repeat past
    the limit gets `429` rather than `200`, so show "try again later".

## Notifications

Following, follow requests and reactions create inbox notifications and APNs
pushes. Blocking someone removes every notification between the two users. For
the types, the payloads and the inbox routes, see
[`API_CONTRACT_NOTIFICATIONS.md`](API_CONTRACT_NOTIFICATIONS.md).
