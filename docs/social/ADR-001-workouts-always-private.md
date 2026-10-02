# ADR 001: Workouts are always private; posts are what users share

- **Status:** Accepted, 2026-10-02. **Amended 2026-10-02** (profile stats,
  below).
- **Context:** the social initiative ([CAPABILITY_MAP.md](CAPABILITY_MAP.md)),
  #131–#141

## Context

The social API lets users follow each other, read a feed and react to posts.
Visibility is set per profile:
- a `PUBLIC` profile's posts are visible to anyone not blocked;
- a `PRIVATE` profile's posts are visible only to accepted followers.

A natural next question is whether followers, or anyone viewing a public
profile, should also see the user's workout history.

## Decision

**Workout data is private to its owner, always.** Neither following someone
nor a public profile ever exposes another user's workouts. This covers:
- program and standalone sessions,
- sets, weights and reps,
- notes, dates and durations,
- run progress and history.

The amendment below names the **one** exception: two opt-out profile stats.

**Sharing is an explicit act, and a post is how a user does it.** A post is
social content by nature, and every post follows the author's profile
visibility, follower gating and blocks. The only workout-derived content that
can reach another user is what the author deliberately puts in a post:
- **Workout shares** (#140): a post may reference the author's own completed
  session. The server copies **only the program's name** onto the post at
  creation, rendered as "Saul completed a workout from Arm Farm 2", or "Saul
  completed a workout" for a standalone workout. The payload carries no session
  id and no session data.
- **The post's own text and photos**, which the author writes and chooses.

## Amendment (2026-10-02): opt-out profile stats

A profile may show two facts about the owner's training
([SPEC-profile-stats.md](SPEC-profile-stats.md)):
- **the active program's name**, which is public program-library data;
- **one integer:** the total of completed program and standalone workouts.

**Why this is consistent with the decision:** neither value is workout data in
the sense above.
- Neither exposes a session, set, weight, note, date, duration or the run's
  position or progress.
- Each is under the owner's control: `showActiveProgram` and
  `showWorkoutCount` default to on and can be turned off at any time.
- Both follow the same visibility rule as posts, so they don't reach anyone
  who couldn't see the owner's posts.
- The owner always sees their own values.

**This exception is closed.** No other workout-derived figure may be shown to
another user without a new ADR. That includes streaks, volume, personal
records, weekly counts, program position or progress, and per-program
breakdowns. The workout read routes stay owner-only. The stats are computed
by `server/utils/profile-stats.ts`, which reads only the program's name and
two counts, and appear only on `GET /api/users/:id`.

## Consequences

- **Every workout read route gates on ownership only.** Another user's session
  is `404`, indistinguishable from a missing one:
  - `GET /api/history`, `/api/workouts/history` and
    `/api/standalone-workout-sessions/history`,
  - `GET /api/workouts/:id` and `/api/standalone-workout-sessions/:id`.

  **Do not add** follower, visibility or "public profile" branches to them.
- **The profile stats in the amendment are the only workout-derived values
  any route returns about another user.** They're served from
  `server/utils/profile-stats.ts` alone. Don't add fields to them, or show
  them anywhere else, without a new ADR.
- **Never add a route that reads another user's workouts,** such as a
  "profile workouts" tab, a follower activity view, or session data embedded
  in the feed. A product need for richer sharing goes **through posts**,
  as a new kind of explicit, author-composed post content. It must not loosen
  workout visibility.
- **New post content derived from a workout copies only what the author chose
  to share,** at the moment they share it, the way workout shares snapshot the
  program name. Posts never hold a live link that exposes session data.
- **Privacy is simple to explain:** "Your workouts are only ever yours. Posts
  are what you share."
- **Trade-off accepted:** there is no automatic activity feed. The feed
  contains only what people post.
