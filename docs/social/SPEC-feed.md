# Spec: feed

Module of [CAPABILITY_MAP.md](CAPABILITY_MAP.md). Shared commands, structure,
style, testing and boundaries are defined there. Builds on `follows`
([SPEC-follows.md](SPEC-follows.md), #135).

## Objective

`GET /api/feed` returns, newest first:

- the caller's **own posts**, and
- the posts of **everyone the caller follows** (accepted).

This is the pivoted form of the initiative's original requirement. Unfollowing
someone, or being removed as their follower, drops their posts from the next
fetch. Following again brings them back, older posts included.

## Design

The feed is computed on read, with no feed table and no background jobs:

1. `authorIds = [me, ...await followingIdsOf(me)]`. This is one indexed query
   on the `Follow(followerId, followeeId)` unique index, and counts accepted
   follows only, so a pending request never puts posts in your feed.
2. `post.findMany({ where: { authorId: { in: authorIds }, ...pageWhere(before) }, orderBy: newestFirst, take: limit, select: postSelect })`
   uses the existing `Post(authorId, createdAt desc, id desc)` index.

**No visibility or block filter is needed.** Every author in the list is one
the caller may see:

- **The caller:** always.
- **An accepted followee:** this satisfies `canViewPostsBy`, whether their
  profile is `PUBLIC` or `PRIVATE`.
- **Blocks:** a block deletes follows in both directions under the pair lock,
  and no follow can be created while a block exists. So a blocked user is
  never a followee.

The query is therefore exactly the visibility rule, applied to a whole author
list at once.

The list always contains the caller, so the posts query always runs. Someone
following nobody sees just their own posts.

**Scale note:** this is unchanged from the plan. Past thousands of followees
with very active posting, a single `IN` list over one index stops being
cheap. That's the point to revisit fan-out-on-write, and it's tracked in
`tasks/plan.md`. It wouldn't change this contract.

## Route

### `GET /api/feed?limit=&before=&beforeId=`

- **200** `{ posts: Post[] }`. This is the same `Post` payload as everywhere
  else, so `isMine` marks the caller's own posts.
- **Pagination** is identical to `GET /api/users/:id/posts` and
  `GET /api/history` (`parsePageQuery`, `pageWhere`, `newestFirst`), with the
  same 400s.
- **Auth and limits:** authenticated like every route. There is no rate
  limit; it's a read, the same as History.

## Out of scope

- Ranking, "top posts", unread markers, real-time updates.
- A global "discover" feed of every `PUBLIC` profile (ruled out in the
  capability map).
- Photos, reactions and workout lines. These appear in the feed automatically
  when their modules add them to the `Post` payload.

## Files

- `server/api/feed.get.ts` (+ test)
- `server/middleware/auth.test.ts`: add `/api/feed`
- `docs/API_CONTRACT_SOCIAL.md`: a "Feed" section
- No schema change and no migration.

## Success criteria

- [ ] My own posts appear in my feed, marked `isMine: true`.
- [ ] Posts from users I follow (accepted) appear, including followees with
      `PRIVATE` profiles.
- [ ] Posts from users I've only *requested* to follow never appear.
- [ ] Posts from `PUBLIC` users I don't follow never appear.
- [ ] After unfollowing, or being removed as a follower, the next fetch
      excludes their posts.
- [ ] After following again, the next fetch includes them, older ones too.
- [ ] Following nobody → only my own posts.
- [ ] Paging across a `createdAt` tie loses and repeats nothing (id tiebreak).
- [ ] Bad `limit` / `before` / `beforeId` → 400, the same messages as History.
