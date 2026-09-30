# Spec: posts

Module of [CAPABILITY_MAP.md](CAPABILITY_MAP.md). Shared commands, structure,
style, testing and boundaries are defined there.

## Objective

Let a user write text posts, choose who can see each one, and edit or delete
their own. Define the single `Post` payload and the one visibility rule that
`feed`, `post-photos`, `reactions` and `workout-shares` all build on.

## Visibility — the one rule

A viewer can see a post if **any** of these holds:

1. the viewer is the author; or
2. no block exists between viewer and author (either direction) **and**
   - the post is `PUBLIC`, or
   - the post is `FRIENDS` and the two are friends now.

Everything else is 404, indistinguishable from a post that doesn't exist.
"Friends now" is `areFriends` (an `ACCEPTED` row), so unfriending hides
`FRIENDS` posts immediately and re-friending restores them. Changing a post's
visibility also takes effect immediately.

`canViewPost` in `server/utils/posts.ts` is the only implementation; every
route that takes a post id goes through it.

## Data model

```prisma
enum PostVisibility {
  PUBLIC
  FRIENDS
}

model Post {
  id         String         @id @default(cuid())
  authorId   String
  body       String
  visibility PostVisibility @default(FRIENDS)
  createdAt  DateTime       @default(now())
  editedAt   DateTime?      // set only when a PATCH actually changes something

  author User @relation(fields: [authorId], references: [id], onDelete: Cascade)

  @@index([authorId, createdAt(sort: Desc), id(sort: Desc)])
}
```

The index serves both a profile's posts and the feed ("posts by these authors,
newest first"). Additive migration only.

- **Hard delete.** Deleting a post removes the row; later modules cascade
  their rows (photos, reactions) from it. `reports` will snapshot the
  reported text so a report outlives the post.
- **`body` is non-null.** It is required (1–2,000 characters after trimming)
  until `post-photos` lands, which allows an empty body when a post has at
  least one photo — no schema change needed then.

## Payload

```ts
interface Post {
  id: string
  author: PublicUser
  body: string
  visibility: 'PUBLIC' | 'FRIENDS'
  createdAt: string
  editedAt: string | null     // non-null → show "Edited"
  isMine: boolean
}
```

Later modules add fields (`photos`, `reactions`, `workout`) — additive only.
`postSelect` and `toPost()` in `server/utils/posts.ts` build it, so every
route returns the identical shape.

## Routes

### `POST /api/posts` `{ body, visibility? }`

- `body`: string, trimmed, 1–2,000 chars → else 400.
- `visibility`: `'PUBLIC' | 'FRIENDS'`, default `FRIENDS` → anything else 400.
- 201 `Post`. Rate-limited: `rateLimitByKey('post-create:<userId>', 30, '1 h')`.

### `GET /api/posts/:id`

- 200 `Post` if `canViewPost`, else 404.

### `PATCH /api/posts/:id` `{ body?, visibility? }`

- Author only; anyone else → 404 (the existing ownership convention).
- At least one field, same validation as create → else 400.
- An omitted field is left unchanged. In particular, an omitted `visibility`
  keeps the current one; the `FRIENDS` default applies to create only.
- Sets `editedAt` only when a value actually changes; a no-op PATCH returns
  the post unchanged. 200 `Post`.

### `DELETE /api/posts/:id`

- Author only, else 404. 204.

### `GET /api/users/:id/posts?limit=&before=&beforeId=`

- The user's posts the caller may see, newest first: all of them if it's the
  caller; `PUBLIC` + `FRIENDS` if friends; `PUBLIC` only otherwise.
- 404 if the user doesn't exist or a block exists either way (same as
  `GET /api/users/:id`).
- **Pagination matches `GET /api/history`:** `limit` default 20, clamped to
  1–50; `before` (ISO timestamp) + `beforeId` together, taken from the last
  post of the previous page; a page shorter than `limit` is the end.
  Validation and 400s identical to History. `feed` uses the same scheme.
- 200 `{ posts: Post[] }`.

The capability map's `?cursor=` sketch for the feed is replaced by this
scheme, so the iOS client pages Posts, Feed and History the same way.

## Helpers — `server/utils/posts.ts`

```ts
export const postSelect: Prisma.PostSelect          // includes author: publicUserSelect
export function toPost(row, viewerId: string): Post
/** The visibility rule above. `post` needs authorId + visibility. */
export async function canViewPost(viewerId: string, post: { authorId: string; visibility: PostVisibility }): Promise<boolean>
/** Parses limit/before/beforeId exactly as GET /api/history does; throws 400s. */
export function parsePageQuery(query): { limit: number; before?: { createdAt: Date; id: string } }
```

## Out of scope

Comments, mentions, hashtags, link previews, drafts, scheduled posts,
reposts, edit history (only "was edited").

## Files

- `prisma/schema.prisma` + migration; `vitest.setup.ts` (`post` mock + globals)
- `server/utils/posts.ts` (+ test)
- `server/api/posts/index.post.ts`, `[id].get.ts`, `[id].patch.ts`, `[id].delete.ts` (+ tests)
- `server/api/users/[id]/posts.get.ts` (+ test)
- `docs/API_CONTRACT_SOCIAL.md`, `docs/social/CAPABILITY_MAP.md` (pagination row)

## Success criteria

- [ ] Create → the author sees it at `GET /api/posts/:id` and on their profile.
- [ ] `PUBLIC` post: visible to a stranger by id and on the author's profile.
- [ ] `FRIENDS` post: visible to a friend; 404 for a stranger; 404 for the
      friend right after unfriending; visible again after re-friending.
- [ ] Any post: 404 to a user blocked in either direction.
- [ ] Switching `PUBLIC` → `FRIENDS` hides it from strangers on the next read.
- [ ] Only the author can PATCH or DELETE (404 for everyone else, including friends).
- [ ] PATCH sets `editedAt`; a no-op PATCH does not.
- [ ] Profile posts page correctly across a `createdAt` tie (the `id` tiebreak).
- [ ] 400s: empty/whitespace/2,001-char body, bad visibility, empty PATCH,
      bad `limit`/`before`/`beforeId`.

## Decisions

1. **Default visibility is `FRIENDS`** (2026-09-29): an omitted `visibility`
   on **create** means friends-only, so sharing publicly is always an explicit
   choice. On edit, an omitted `visibility` keeps the post's current one, so a
   body-only edit never changes who can see it.
