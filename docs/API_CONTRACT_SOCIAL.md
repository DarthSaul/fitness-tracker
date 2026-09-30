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
| Search | `GET /api/users/search?q=` | `200 { users: PublicUser[] }`, at most 20, ordered by name |
| Profile | `GET /api/users/:id` | `200 PublicUser` |

- `q` is trimmed and must be 2–100 characters (`400` otherwise).
- A `q` containing `@` matches an email **exactly** (case-insensitive) — type
  the whole address; partial emails find nobody. Anything else matches any
  part of the name, case-insensitive.
- Results never include the caller or anyone blocked in either direction.
- Search is limited to 30 requests per minute per user (`429`) — debounce
  as-you-type search on the client (~300 ms).
- Profile `404`s for an unknown user **and** for a blocked one; the caller's
  own id works.
- Later releases add `relationship` (`friendships`) to both responses.

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
- Blocking will also remove any friendship or pending friend request between
  the two users (from the `friendships` release onward). Unblocking never
  restores it.
