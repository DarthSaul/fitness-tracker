# Spec: Weekly workout goal

Status: **approved** · 2026-10-05

## Objective

A user can set a target number of workouts per week. The iOS home screen shows
a card such as **"1/4 this week"**, where 4 is the goal and 1 is the number of
workouts completed so far this week.

- The goal is **private**. Only its owner ever sees it.
- It is **off by default**.
- The user can **enable**, **disable**, and **set/update** the goal. **Remove**
  means disable: the number is kept, so turning the goal back on restores it.

### User stories

1. As a user, I turn the weekly goal on and pick a number from 1 to 7.
2. As a user, I change my goal from 3 to 4, and the card updates.
3. As a user, I turn the goal off. The card disappears and my 4 is remembered.
4. As a user, I see how many workouts I've completed this week against my goal.
5. As a user, I choose which day my week starts on (Sunday by default).

## API

### Settings: `GET` / `PATCH /api/auth/me`

Three new fields on `meSelect` (`server/utils/profile.ts`), the owner-only shape:

| Field | Type | Default | Notes |
|---|---|---|---|
| `weeklyWorkoutGoalEnabled` | boolean | `false` | Whether the goal is on |
| `weeklyWorkoutGoal` | integer 1–7 | `3` | Kept while disabled |
| `weekStartDay` | `SUNDAY` … `SATURDAY` | `SUNDAY` | The first day of the user's week |

`PATCH` accepts any subset of the three, alongside the existing fields:

```jsonc
{ "weeklyWorkoutGoalEnabled": true, "weeklyWorkoutGoal": 4 } // enable and set
{ "weeklyWorkoutGoal": 5 }                                   // update; leaves the toggle alone
{ "weekStartDay": "MONDAY" }                                 // change the week start
{ "weeklyWorkoutGoalEnabled": false }                        // disable / remove
```

- `weeklyWorkoutGoal` must be an integer from 1 to 7. Anything else is a
  `400`, including `null`, `0`, `8`, `4.5` and `"4"`.
- `weeklyWorkoutGoalEnabled` must be a boolean, or the request is a `400`.
- `weekStartDay` must be one of the seven uppercase day names, or the request
  is a `400`.
- Setting the number or the week start while disabled is allowed. The goal
  stays disabled.
- `weekStartDay` is a general preference, not a goal-only one. The analytics
  dashboard's `sessionsThisWeek` uses it too (see *Dashboard* below).

### Progress: `GET /api/weekly-goal` (new, authenticated)

```jsonc
{
  "enabled": true,
  "goal": 4,
  "completedThisWeek": 1,
  "weekStartDay": "SUNDAY",
  "weekStart": "2026-10-04T05:00:00.000Z", // Sunday 00:00 in `timeZone`, as UTC
  "weekEnd": "2026-10-11T05:00:00.000Z",   // exclusive; the next week's start
  "timeZone": "America/Chicago"
}
```

`weekEnd` is computed in the zone, not as `weekStart + 7 days`. A week that
crosses a DST change is 167 or 169 hours long.

- **Completed this week**: program sessions (`WorkoutSession`) plus standalone
  sessions (`StandaloneWorkoutSession`) with `status = COMPLETED` and
  `completedAt` in `[weekStart, weekEnd)`. Program and standalone are counted
  the same way as the profile's completed count.
- **Which week a workout counts toward**: the week containing its
  `completedAt`, the date stored on the session record. Editing a workout's
  date (`PATCH /api/workouts/:id` and the standalone equivalent write
  `completedAt`) moves it to that date's week. Backdating counts the same way.
- **Week**: `weekStartDay` 00:00 to the next `weekStartDay` 00:00 in the
  user's local time.
- **Time zone**, in order of precedence:
  1. `?timeZone=<IANA>` query param. iOS sends `TimeZone.current.identifier`.
  2. `User.timezone`, which iOS already stores for reminders.
  3. `UTC`.

  An invalid `timeZone` param is a `400`. Validation reuses
  `isValidTimeZone` (`server/utils/notification-preferences.ts`).
- The route always returns the count, even when disabled. The client decides
  whether to show the card, and the queries are two cheap indexed `COUNT`s on
  `@@index([userId, status])`.
- The route lives outside `/api/auth/`. Everything under that prefix is
  public in `server/middleware/auth.ts`, and only the exact path
  `/api/auth/me` is carved back out, so `/api/auth/me/weekly-goal` would ship
  unauthenticated.

### Dashboard: `GET /api/analytics/dashboard` uses the same week

`sessionsThisWeek` moves from a hard-coded Monday and a fixed offset to
`weekStartDay` and `weekBounds`, so the card and the dashboard always agree.

- **Time zone**, in order of precedence:
  1. a new `?timeZone=<IANA>` param. An invalid one is a `400`.
  2. the existing `?tzOffset=<minutes>`, kept for web bundles cached by the
     PWA.
  3. `User.timezone`.
  4. `UTC`.
- The web client (`useAnalytics`) sends `timeZone` from
  `Intl.DateTimeFormat().resolvedOptions().timeZone` instead of `tzOffset`.
- The response shape is unchanged.
- **Behaviour change:** with the default `SUNDAY`, a Sunday workout now counts
  toward the new week. Before, Monday was the start.

### Privacy (ADR 001)

The goal and its progress never appear in `PublicUser`, in
`GET /api/users/:id`, in profile stats, in posts or in notifications. This
feature adds no workout-derived data visible to another user, so it needs no
ADR amendment.

## Data model

Additive migration (expand only). It is safe for the shared hosted database,
because production's current client ignores unknown columns.

```prisma
/// Weekly workout goal (docs/weekly-goal/SPEC-weekly-goal.md). Private to the owner.
weeklyWorkoutGoalEnabled Boolean @default(false)
/// Kept while disabled so re-enabling restores it; raw CHECK 1–7.
weeklyWorkoutGoal        Int     @default(3)
/// First day of the user's week, for the weekly goal's "this week".
weekStartDay             WeekStartDay @default(SUNDAY)

enum WeekStartDay {
  SUNDAY
  MONDAY
  TUESDAY
  WEDNESDAY
  THURSDAY
  FRIDAY
  SATURDAY
}
```

The migration adds a raw `CHECK ("weeklyWorkoutGoal" BETWEEN 1 AND 7)`, the
same approach as the `bio` and `username` constraints.

## Tech stack

Nuxt 4 / Nitro, Prisma, and PostgreSQL (Supabase). Tests run on Vitest. No
new dependencies.

## Commands

```bash
npx vitest run server/api/auth/me server/api/weekly-goal server/utils/week server/api/analytics  # focused tests
npx nuxi typecheck                                                                # types
pnpm build                                                                        # build
pnpm db:local:migrate:new --name weekly_workout_goal                              # migration (LOCAL stack only)
```

## Project structure

```text
prisma/schema.prisma                         # WeekStartDay enum + three User columns
prisma/migrations/<ts>_weekly_workout_goal/  # CREATE TYPE + ADD COLUMN ×3 + CHECK
server/utils/profile.ts                      # meSelect + parseWeeklyWorkoutGoal / parseWeekStartDay
server/api/auth/me.patch.ts                  # accept the three fields
server/api/auth/me.get.ts                    # OpenAPI description only
server/utils/week.ts                         # weekBounds, parseTimeZoneParam, completedWorkoutsBetween
server/api/weekly-goal/index.get.ts          # progress route
server/api/analytics/dashboard.get.ts        # sessionsThisWeek via weekBounds
app/composables/useAnalytics.ts              # send timeZone instead of tzOffset
docs/API_CONTRACT_WEEKLY_GOAL.md             # iOS client contract
```

Tests are colocated as `*.test.ts`, following the existing pattern.

## Code style

Follow `me.patch.ts`: manual inline validation, `createError` with an accurate
status, and `(event.context.logger ?? logger)` in the `catch` block. For
example:

```ts
export function parseWeeklyWorkoutGoal(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > WEEKLY_GOAL_MAX) {
    throw createError({ statusCode: 400, statusMessage: `weeklyWorkoutGoal must be an integer from 1 to ${WEEKLY_GOAL_MAX}` })
  }
  return raw
}
```

## Testing strategy (TDD: failing test first)

- **`weekBounds` unit tests:**
  - "now" falling exactly on the start day at 00:00, mid-week, and the last
    minute before the next start
  - every `weekStartDay` value, with Sunday and Monday as the main cases
  - a non-UTC zone, where Saturday 23:00 local is already Sunday in UTC
  - a DST-transition week (`America/Chicago`, early November), checking the
    167- or 169-hour span
  - the UTC fallback
- **`PATCH /api/auth/me`:**
  - the accept matrix: each field alone, all together, and alongside an
    existing field
  - the reject matrix: `null`, `0`, `8`, `4.5`, `"4"`, a non-boolean toggle,
    and `"monday"` / `"FUNDAY"` / `1` for `weekStartDay`
  - disabling keeps the number
- **`GET /api/auth/me`:** returns all three fields, and the defaults are
  `false` / `3` / `SUNDAY`.
- **`GET /api/weekly-goal`:**
  - counts program + standalone `COMPLETED` sessions only
  - excludes `IN_PROGRESS` sessions, last week's sessions and other users'
    sessions
  - time zone precedence: param, then stored zone, then UTC
  - a bad param is a `400`
  - returns the count while disabled
  - a workout whose `completedAt` is edited into the previous week drops out
    of this week's count
  - changing `weekStartDay` moves the window
- **`GET /api/analytics/dashboard`:**
  - `sessionsThisWeek` follows the stored `weekStartDay`, with Sunday as the
    default and Monday after a change
  - time zone precedence: `timeZone`, then `tzOffset`, then the stored zone,
    then UTC
  - a bad `timeZone` is a `400`
- **Privacy regression:** `GET /api/users/:id` and the `PublicUser` select do
  not include any of the three fields.

## Boundaries

- **Always:**
  - write the failing test first
  - keep the migration expand-only
  - run the migration on the local stack (`.env.dev`), never on `.env`
  - finish with verify-app
- **Ask first:**
  - widening the range beyond 1–7
  - exposing the goal to anyone but its owner (that needs an ADR)
  - adding web UI
- **Never:**
  - put the route under `/api/auth/`, apart from `/api/auth/me` itself
  - run `prisma migrate` against the hosted DB from this work
  - add the fields to `PublicUser` or profile stats

## Success criteria

1. A new user's `GET /api/auth/me` returns `weeklyWorkoutGoalEnabled: false`,
   `weeklyWorkoutGoal: 3` and `weekStartDay: "SUNDAY"`.
2. `PATCH` with `{ weeklyWorkoutGoalEnabled: true, weeklyWorkoutGoal: 4 }`
   returns both values. A later `{ weeklyWorkoutGoalEnabled: false }` returns
   `false, 4`.
3. Out-of-range or non-integer goals return a `400`, and nothing is written.
4. `GET /api/weekly-goal`:
   - returns the correct count for a Chicago user with sessions on either
     side of local Sunday 00:00, and of Monday 00:00 once `weekStartDay` is
     `MONDAY`
   - returns `401` without auth
5. None of the three fields appears in any response about another user.
6. The dashboard's `sessionsThisWeek` equals the card's `completedThisWeek`
   for the same user, time zone and moment.
7. `docs/API_CONTRACT_WEEKLY_GOAL.md` documents both endpoints for iOS.
8. verify-app passes.

## Decisions

- **Week start** is a per-user setting, `weekStartDay`, defaulting to
  `SUNDAY` (decided 2026-10-05). All seven days are allowed. This costs the
  same as allowing only Sunday and Monday, and avoids a later enum migration.
- **The dashboard's `sessionsThisWeek` follows `weekStartDay`**, in this same
  change (decided 2026-10-05).
- **A workout counts toward the week containing the date on its record**,
  `completedAt`, including after a date edit or a backdate (decided
  2026-10-05).

## Open questions

None. The dashboard follow-up is now in scope (see *Dashboard* above).
