# Spec: reactions

Module of [CAPABILITY_MAP.md](CAPABILITY_MAP.md). Shared commands, structure,
style, testing and boundaries are defined there. Builds on `posts` and the
profile-level visibility rule (`canViewPostsBy`, [SPEC-follows.md](SPEC-follows.md)).

## Objective

Anyone who can see a post can react to it with emoji. As in Slack, one user may
add **several different** emoji to the same post, but each emoji only once.
Every post payload shows the totals per emoji and which ones are the caller's.
For each emoji, the caller can also list who reacted.

## Decisions

- **Many distinct emoji per user per post** (agreed at the start of the
  initiative): unique on `(postId, userId, emoji)`.
- **Any single emoji.** The input must be exactly one emoji as Unicode defines
  them (`/^\p{RGI_Emoji}$/v`). That includes skin tones, ZWJ sequences
  (👨‍👩‍👧), flags (🇬🇧) and keycaps (1️⃣). Two emoji, text or padded input is
  `400`. Verified on Node 24.
- **Normalized before storing.** A bare `❤` (U+2764 with no U+FE0F) is
  accepted when adding the emoji-presentation selector makes it valid, and is
  stored as `❤️`. Clients that send either form then count as the same
  reaction.
- **Who reacted is listable, per emoji** (decided 2026-10-01), through
  `GET /api/posts/:id/reactions/:emoji`, paginated. Reactors appear as
  `PublicUser`, which is already public through `GET /api/users/:id`. A
  private user's reaction to a public post is listed: their profile is
  visible, and only their posts are private.
- **Counts and lists both exclude anyone blocked in either direction**, for
  each viewer. Blocks are never revealed, and if a count included a user the
  list hides, a count of 3 beside two names would leak a block. So the counts
  query subtracts the caller's `blockedUserIds`, and counts always equal what
  the list would show.
- **Each listed reactor carries the caller's follow state** (`Relationship`),
  as search results do, so the app can reuse one row and button component.
  This is a default, not a requirement: it costs one query per page and can be
  dropped.
- **Up to 10 distinct emoji per user per post** (approved 2026-10-01). This
  stops one user flooding a post.

## Data model

```prisma
model PostReaction {
  id        String   @id @default(cuid())
  postId    String
  userId    String
  emoji     String   // normalized, fully-qualified RGI emoji
  createdAt DateTime @default(now())

  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([postId, userId, emoji])
  @@index([postId, emoji, createdAt(sort: Desc), id(sort: Desc)])
}
```

The `(postId, emoji, createdAt desc, id desc)` index serves both the counts
`groupBy` and the newest-first who-reacted pages. The migration is additive:
a new table that the deployed code never reads.
Deleting a post or an account removes its reactions through the cascade.
There is no storage involved.

## Routes

`:emoji` is URL-encoded (`%F0%9F%91%8D` for 👍). The route reads it with
`getRouterParam(event, 'emoji', { decode: true })`; without that flag, h3
1.15 leaves it percent-encoded.

### `PUT /api/posts/:id/reactions/:emoji`

- **Idempotent.** It adds the caller's reaction:
  - **201** when the reaction is new,
  - **200** when the caller already had it, which is safe to retry.

  Both return `{ reactions: ReactionSummary[] }` for that post.
- **Errors:**
  - **404** if the post doesn't exist or the caller can't see it, applying
    `canViewPostsBy` to the post's author. A post you can't see never
    reveals that it exists.
  - **400** for an invalid emoji.
  - **409** at the 10-per-user cap.
- **Race:** two concurrent PUTs for the same emoji can't create a duplicate.
  The `@@unique` returns P2002, which the route treats as "already there"
  (200).
- **Rate limit:** `rateLimitByKey('react:<userId>', 300, '1 h')`. Reacting
  is a quick tap, so the limit is generous.

### `GET /api/posts/:id/reactions/:emoji?limit=&before=&beforeId=`

- **200** `{ users: (PublicUser & Relationship & { reactedAt: string; cursorId: string })[] }`:
  everyone who reacted with that emoji, newest first.
- **Pagination** is identical to `GET /api/history` and the feed
  (`parsePageQuery` / `pageWhere` on the reaction's `createdAt` and `id`, the
  same 400s). For the next page, send the last row's `reactedAt` as `before`
  and its `cursorId` (the reaction's id) as `beforeId`. That id is returned
  explicitly, so the client never confuses it with the user's `id`.
- **Left out:** anyone blocked in either direction, matching the counts. The
  caller appears in the list if they reacted, with `isSelf: true`.
- **Errors:** **404** if the caller can't see the post, so it never reveals the
  post exists. **400** for an invalid emoji.

### `DELETE /api/posts/:id/reactions/:emoji`

- Removes the caller's own reaction. **204**, also when there was nothing to
  remove (idempotent).
- **404** if the caller can't see the post, so it never reveals the post
  exists. **400** for an invalid emoji.
- Only the caller's own reaction is ever removed. There is no route for
  removing other people's.

## Payload

`Post` gains:

```ts
reactions: { emoji: string; count: number; mine: boolean }[]
// Most-used first, ties broken by the order each emoji first appeared on the post; [] when none.
```

`toPostPayloads` fills it for a whole page in **three queries**, however many
posts the page holds:
- the caller's `blockedUserIds`,
- a `groupBy` on `(postId, emoji)` for the counts, excluding those users,
- one lookup of the caller's own reactions on those posts.

These run alongside the single photo-signing call. Every route that returns
posts, including the feed, gets reactions automatically.

## Out of scope

- Notifications for reactions. Push triggers are a separate roadmap item.
- Reactions on anything except posts.
- Custom emoji or uploaded images.

## Files

- `prisma/schema.prisma` + migration; `vitest.setup.ts` (`postReaction` mock)
- `server/utils/reactions.ts` (+ test): `parseReactionEmoji` (validate and
  normalize), `reactionSummaries` (the two-query page aggregation)
- `server/utils/posts.ts` (+ test): `toPostPayloads` adds `reactions`
- `server/api/posts/[id]/reactions/[emoji].put.ts`, `[emoji].get.ts` and
  `[emoji].delete.ts` (+ tests)
- `server/middleware/auth.test.ts`; `docs/API_CONTRACT_SOCIAL.md`
- **Carried over from the post-photos check:** in `server/utils/post-photos.test.ts`,
  replace the whole-file `0x88 0x25` byte scan with a JPEG APP-segment walk.
  The scan only passes today because its fixture is a tiny solid-colour image.

## Success criteria

- [ ] 👍 then 🔥 from the same user → both counted, both `mine: true`. The
      same 👍 twice → one row, second call 200.
- [ ] `❤` and `❤️` from two users → one entry, `count: 2`.
- [ ] Skin-tone, ZWJ, flag and keycap emoji are accepted. `👍👍`, `a`, an
      empty string and 👍 with a leading space are rejected with 400.
- [ ] A user who can't see the post (private profile not followed, or blocked
      either way) → 404 on PUT and DELETE, never 403.
- [ ] The 11th distinct emoji from one user on one post → 409.
- [ ] Concurrent duplicate PUTs → one row, no 500.
- [ ] Every post route, including the feed, shows `reactions` sorted by count,
      with the caller's own flagged, in three extra queries per page.
- [ ] DELETE removes only the caller's own reaction. Deleting the post or the
      account removes reactions through the cascade.
- [ ] Who-reacted lists the emoji's reactors newest first, as `PublicUser` with
      follow state. Paging across a `createdAt` tie loses and repeats nothing.
- [ ] A user blocked in either direction is absent from **both** the list and
      the counts, so for every viewer each count equals the list's total.
- [ ] Who-reacted for a post the caller can't see → 404.
