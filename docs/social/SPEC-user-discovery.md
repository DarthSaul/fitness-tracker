# Spec: user-discovery

Module of [CAPABILITY_MAP.md](CAPABILITY_MAP.md). Shared commands, structure,
style, testing and boundaries are defined there.

## Objective

Let a signed-in user find another user so they can send a friend request, and
view that user's minimal public profile. Without this, `friendships` has no
way to learn a target's id.

## Routes

### `GET /api/users/search?q=<query>`

- `q` is trimmed; 400 unless 2–100 chars.
- If `q` contains `@`: **exact**, case-insensitive email match (so an email
  can't be discovered by prefix).
- Otherwise: case-insensitive `contains` match on `name`.
- Always excludes the caller, and any user blocked in **either** direction
  (via `blockedUserIds` from `blocking`).
- Ordered by `name` asc, then `id`; max 20 results; no pagination.
- Rate-limited to 30 req/min **per user** (new `rateLimitByKey` alongside
  `rateLimitByIp` in `server/utils/rate-limit.ts`; no-op without Upstash),
  since exact-email search is an account-existence oracle.
- 200 `{ users: PublicUser[] }`

### `GET /api/users/:id`

- 200 `PublicUser`. 404 if the user doesn't exist **or** a block exists
  either way (via `isBlockedEitherWay`; not disclosed). The caller may fetch
  themselves.

```ts
interface PublicUser { id: string; name: string | null; avatarUrl: string | null }
```

`friendships` later adds `relationship: 'self' | 'none' | 'friends' |
'request_sent' | 'request_received'` to both responses (an additive change),
and `posts` adds `GET /api/users/:id/posts`.

## Out of scope

Profile editing (already `PATCH /api/auth/me`), usernames/handles, suggested
friends, contact import.

## Files

- `server/api/users/search.get.ts` (+ test)
- `server/api/users/[id].get.ts` (+ test)
- `server/utils/rate-limit.ts` (+ `rateLimitByKey`, tests)
- `server/utils/public-user.ts` — the `PublicUser` Prisma `select` shared by
  every social module

## Success criteria

- [ ] Search by exact email (any case) finds the user; a partial email finds nobody.
- [ ] Search by partial name (any case) finds matching users, capped at 20.
- [ ] Neither route ever returns `email`.
- [ ] Caller never appears in their own search results.
- [ ] A blocks B → B is absent from A's search and A from B's, and
      `GET /api/users/:id` is 404 in both directions.
- [ ] `q` under 2 or over 100 chars → 400; unknown id → 404.
- [ ] Unauthenticated requests → 401 (existing middleware; one test asserts the
      routes aren't under a public prefix).
- [ ] 31st search in a minute → 429 when Upstash is configured.
