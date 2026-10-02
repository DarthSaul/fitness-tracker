# Spec: workout-shares

Module of [CAPABILITY_MAP.md](CAPABILITY_MAP.md). Shared commands, structure,
style, testing and boundaries are defined there. Builds on `posts`,
`post-photos` and `reactions`, which all edit `Post` and its payload.

## Objective

A post can say that its author finished a workout, as text only:

- "Saul completed a workout from Arm Farm 2" for a program workout,
- "Saul completed a workout" for a standalone (Strength on the Go) workout.

The share **never** exposes the session's sets, weights, notes, week/day or
duration. Only the program's name leaves the server, and the program library
is already public.

## Decisions (approved 2026-10-01)

1. **A share is part of a post, not a new resource.** `POST /api/posts` takes an
   optional session reference. A share can also carry text and photos, and its
   text may be empty, as with photos. It is visible, reacted to, deleted and
   fed exactly like any other post.
2. **Only the author's own `COMPLETED` session.** Another user's session, or one
   that doesn't exist, is `404`, so an id never reveals that a session exists.
   A session that isn't `COMPLETED` is `409`.
3. **Each session can be shared once.** A second share of the same session is
   `409`, which also stops a double tap in the app creating two posts.
4. **The text is snapshotted when the post is created.** The post stores the
   kind (`PROGRAM` / `STANDALONE`) and the program's name at that moment. Two
   things follow:
   - **Deleting the session doesn't damage the post.** A standalone session can
     be deleted even when `COMPLETED`, and that would otherwise leave a
     share-only post empty. The session link is set to null, the share line
     stays, and only the once-per-session guard is lost for that session.
   - **The post's text is stable.** A program renamed later doesn't rewrite old
     posts.
5. **Fixed once posted, like photos.** `PATCH /api/posts/:id` still edits only
   `body`, and a share's text may be emptied.

## Data model

Additive changes to `Post`. Deployed code selects posts explicitly, so it never
reads the new columns.

```prisma
enum WorkoutShareKind {
  PROGRAM
  STANDALONE
}

model Post {
  // …existing fields…
  /// Set when the post shares a workout; with sharedProgramName, the snapshot the text is built from.
  sharedWorkoutKind   WorkoutShareKind?
  /// The program's name when shared (PROGRAM only).
  sharedProgramName   String?
  /// Once-per-session guard; nulled if the session is deleted, the share text stays.
  workoutSessionId    String?   @unique
  standaloneSessionId String?   @unique

  workoutSession    WorkoutSession?           @relation(fields: [workoutSessionId], references: [id], onDelete: SetNull)
  standaloneSession StandaloneWorkoutSession? @relation(fields: [standaloneSessionId], references: [id], onDelete: SetNull)
}
```

The migration adds a `CHECK` so a row can't be half a share:
- **`PROGRAM`:** `sharedProgramName` is set, and `standaloneSessionId` is null.
- **`STANDALONE`:** `sharedProgramName` is null, and `workoutSessionId` is null.
- **Not a share** (`sharedWorkoutKind` null): all three are null.

The session ids may be null in any shared row, because the session was deleted.
Postgres treats NULLs as distinct, so the `@unique` columns allow any number of
posts that don't share a workout.

## Routes

### `POST /api/posts`

- **New input:** `{ body?, photoIds?, workoutSessionId?, standaloneSessionId? }`.
  - At most one of the two session ids may be given; both at once is `400`.
  - These are the ids `GET /api/history` already returns, with its `type`
    telling the app which key to use.
- **Body:** may be empty when there is a share or a photo.
- **Checks, inside the existing transaction:**
  - The session is the caller's own, or `404 'Workout not found'`.
  - Its `status` is `COMPLETED`, or `409 'Workout is not completed'`.
  - It isn't already shared. P2002 on the unique column becomes
    `409 'Workout already shared'`. That covers two concurrent shares too, so
    no lock is needed.
- **Program name:** for a program session, it is read through
  `userProgram → program.name`.

### `PATCH /api/posts/:id`

`allowEmpty` becomes "has photos **or** shares a workout". The session keys
are ignored, the same way `photoIds` is.

## Payload

`Post` gains:

```ts
workout: { programName: string | null } | null
// null: not a share. programName null: a standalone workout.
```

The server sends the structured data, not a sentence. The app composes "<name>
completed a workout[ from <programName>]", so the wording can change or be
localized without an API change. `postSelect` gains the two snapshot columns.
That adds **no queries**: no session or program is read when posts are read.

## Out of scope

- Any session detail: sets, volume, PRs, duration, notes, or week/day.
- Marking a History row as "already shared". The app learns that from the
  `409`, and it could be added later.
- Automatic posts when a workout finishes.
- Sharing someone else's workout.

## Files

- `prisma/schema.prisma` + migration (enum, four columns, CHECK, FKs `SET NULL`)
- `server/utils/posts.ts` (+ test):
  - `postSelect` and `workout` in the payload,
  - `parsePostContent` gains the session ids and the empty-body rule.
- `server/api/posts/index.post.ts` (+ test): validate, snapshot, map P2002 to 409
- `server/api/posts/[id].patch.ts` (+ test): `allowEmpty` includes shares
- `docs/API_CONTRACT_SOCIAL.md`, `CAPABILITY_MAP.md`, `tasks/todo.md`
- **Fixtures:** feed, profile-posts and post GET tests gain `workout: null`.

## Success criteria

- [ ] Sharing an own `COMPLETED` program session, with no text, creates a post
      whose payload has `workout: { programName: 'Arm Farm 2' }`.
- [ ] An own `COMPLETED` standalone session gives `workout: { programName: null }`.
- [ ] A post without a share has `workout: null`.
- [ ] A share can carry text and photos.
- [ ] Another user's session, or a missing one, is `404`. An `IN_PROGRESS` or
      `EDITING` session is `409`. Both ids at once is `400`.
- [ ] Sharing the same session twice, including concurrently, is `409`, with no
      500 and no second post.
- [ ] Deleting the shared standalone session leaves the post and its share text
      unchanged.
- [ ] Renaming the program later doesn't change the post.
- [ ] No route returns any session field other than the program name.
      Reading posts makes no extra queries.
- [ ] `PATCH` can empty a share's text, and still can't empty a plain text post.
- [ ] Deleting the account removes the posts through the existing cascade.
