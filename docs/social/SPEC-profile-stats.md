# Spec: profile-stats

Module of [CAPABILITY_MAP.md](CAPABILITY_MAP.md). Shared commands, structure,
style, testing and boundaries are defined there. Extends the profile
(`GET /api/users/:id`, #132/#135). **This amends
[ADR 001](ADR-001-workouts-always-private.md).**

## Objective

A user's profile can show two facts about their training, each behind its own
setting that's **on by default** and can be turned off at any time:

- **Current program:** the **name** of their active program.
- **Completed workouts:** the **total number** of workouts they've completed.

Nothing else about their workouts is ever shown.

## Decisions (approved 2026-10-02)

1. **Two owner settings** on `User`, both defaulting to `true`:
   - `showActiveProgram`,
   - `showWorkoutCount`.

   They're changed through `PATCH /api/auth/me` and returned by
   `GET /api/auth/me`.
2. **Who sees them** (approved): **the same rule as posts**, applied with
   `canViewPostsBy`:
   - the owner;
   - anyone not blocked, for a `PUBLIC` profile;
   - accepted followers, for a `PRIVATE` profile.

   Posts and profile stats then follow one visibility rule.
3. **What "current program" exposes:** only the active program's **name**,
   from the `UserProgram` row with `isActive` that is not terminal (`completedAt` and `archivedAt` both null). Program names are public
   library data. It's `null` when nothing is active.
   - **Never shown:** week or day position, progress, the run, dates or
     sessions.
4. **What "completed workouts" exposes:** one integer. It counts program
   sessions plus standalone sessions with status `COMPLETED`.
   - **Never shown:** dates, a breakdown by kind or program, streaks or any
     other derived figure.
5. **Hidden and empty look the same.** When the viewer may not see a stat,
   either because the setting is off or because the visibility rule fails,
   the field is `null`. A missing active program is also `null`. The two cases
   aren't distinguished, so the response doesn't reveal which setting is off.
6. **The owner always sees their own values,** whatever the settings, along
   with the two settings themselves (from `/me`). The app can then preview
   what others see.
7. **ADR 001 is amended, not replaced.** Profile stats become its one named,
   owner-controlled exception: an aggregate count and a public program name.
   Every other part stays the same:
   - workout read routes stay owner-only;
   - no route returns another user's sessions, sets, dates or history;
   - no other workout-derived figure may be added without a new ADR.

   The CLAUDE.md Social section and the route convention are updated to
   match.

## Data model

```prisma
model User {
  // …existing fields…
  /// Profile stats (docs/social/SPEC-profile-stats.md): shown to whoever can see the user's posts.
  showActiveProgram Boolean @default(true)
  showWorkoutCount  Boolean @default(true)
}

model WorkoutSession {
  // …
  @@index([userId, status])   // serves the completed count; the table has no userId index today
}

model StandaloneWorkoutSession {
  // …existing @@index([userId]) …
  @@index([userId, status])   // replaces the plain userId index's role for the count
}
```

- **The migration is additive:** two booleans with defaults, plus indexes.
- **The indexes are created plainly,** not `CONCURRENTLY`. Prisma Migrate
  runs each migration in a transaction, and these tables are small. The
  migration's comment will note this.

## Routes

- **`GET /api/users/:id`** gains two fields:
  - `activeProgram: { name: string } | null`;
  - `completedWorkoutCount: number | null`.

  - **The owner** (viewer is the profile's user) **always gets both values**.
    The two settings aren't checked for the owner (decision 6).
  - **Anyone else** gets each value only when the visibility rule passes
    **and** that value's own setting is on. `showActiveProgram` gates
    `activeProgram`, and `showWorkoutCount` gates `completedWorkoutCount`.
    Otherwise that field is `null`.

  Values that are shown are filled with **two small queries** (the active
  program, and two counts), run alongside the existing follower and following
  counts. A value that's hidden runs no query.
- **`GET /api/auth/me`** returns `showActiveProgram` and `showWorkoutCount`.
- **`PATCH /api/auth/me`** accepts both as booleans. Anything else is `400`.
- **Not added** to `PublicUser`, lists, the feed or search. Stats appear on
  the profile only.

## Out of scope

- Any other stat: streaks, volume, personal records, weekly counts, or the
  program's position or progress.
- Showing stats anywhere except the profile.
- Visibility settings per follower.

## Files

- `prisma/schema.prisma` + migration
- `server/utils/profile-stats.ts` (+ test): `profileStats(owner, viewerId)`,
  which runs the visibility rule, applies the settings and makes the two
  queries
- `server/api/users/[id].get.ts` (+ test)
- `server/api/auth/me.{get,patch}.ts` (+ tests)
- `docs/social/ADR-001-workouts-always-private.md`: the amendment
- `CLAUDE.md`: the Social section and the "workout data is owner-only"
  convention
- `docs/API_CONTRACT_SOCIAL.md`, `CAPABILITY_MAP.md`, `tasks/todo.md`

## Success criteria

- [ ] A visible profile with both settings on returns the active program's
      name and the completed count, where the count covers program plus
      standalone sessions that are `COMPLETED`.
- [ ] Turning either setting off makes that field `null` for everyone but the
      owner, on the next request.
- [ ] A private profile the viewer doesn't follow, or a blocked one, shows
      neither stat, and the profile itself behaves as it does today.
- [ ] No active program gives `activeProgram: null`, which looks the same as
      hidden.
- [ ] Only the program's name leaves the server, never the week, day, run or
      any session field. A test asserts the exact select.
- [ ] Hidden stats run no stats queries.
- [ ] ADR 001 and CLAUDE.md state the exception, and nothing in them
      contradicts it.
