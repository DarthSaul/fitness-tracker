# Weekly workout goal: task list

Spec: `docs/weekly-goal/SPEC-weekly-goal.md` · Plan: `tasks/plan-weekly-goal.md`

Commands:

- `npx vitest run <paths>`
- `npx nuxi typecheck`
- `npx nuxt build`

## Phase 1: Foundation

- [x] **T1: Schema and migration** (S)
  - Acceptance:
    - the `WeekStartDay` enum exists
    - `User` has `weeklyWorkoutGoalEnabled` (default `false`),
      `weeklyWorkoutGoal` (default `3`, `CHECK` 1–7) and `weekStartDay`
      (default `SUNDAY`)
    - the migration only adds things
  - Verify:
    - `pnpm db:local:migrate:new` applies cleanly on the local stack
    - an `UPDATE` setting the goal to 8 is rejected by the `CHECK`
  - Files: `prisma/schema.prisma`, `prisma/migrations/<ts>_weekly_workout_goal/migration.sql`

- [x] **T2: Settings on `/api/auth/me`** (M)
  - Acceptance:
    - `GET` and `PATCH` return all three fields
    - `PATCH` accepts any subset of them
    - the reject matrix from the spec returns `400` and writes nothing
    - disabling keeps the number
    - `publicUserSelect` contains none of the three fields
  - Verify: `npx vitest run server/api/auth/me server/utils/profile`
  - Files:
    - `server/utils/profile.ts` (+ test)
    - `server/api/auth/me.patch.ts` (+ test)
    - `server/api/auth/me.get.ts` (+ test)
    - `vitest.setup.ts`
  - Depends on: T1

### Checkpoint A

- [x] Focused tests pass
- [x] `npx nuxi typecheck` is clean

## Phase 2: Progress

- [x] **T3: Week utility** (S)
  - Acceptance:
    - `weekBounds` is exact for every start day, for UTC, Chicago and a fixed
      offset, and across the DST weeks
    - `parseTimeZoneParam` returns `400` on a bad zone
    - `completedWorkoutsBetween` sums the two `COMPLETED` counts in
      `[start, end)`
  - Verify: `npx vitest run server/utils/week`
  - Files: `server/utils/week.ts` (+ test), `vitest.setup.ts`
  - Depends on: T1

- [x] **T4: `GET /api/weekly-goal`** (S)
  - Acceptance:
    - the response shape matches the spec
    - time zone precedence is param, then stored zone, then UTC
    - the count is returned while the goal is disabled
    - `404` when the user is missing, `500` is logged
    - the route is not under `/api/auth/`
  - Verify: `npx vitest run server/api/weekly-goal`
  - Files: `server/api/weekly-goal/index.get.ts` (+ test)
  - Depends on: T3

- [x] **T5: Dashboard on `weekBounds`, and web sends `timeZone`** (M)
  - Acceptance:
    - `sessionsThisWeek` uses the stored `weekStartDay`
    - time zone precedence is `timeZone`, then `tzOffset`, then the stored
      zone, then UTC
    - a bad `timeZone` returns `400`
    - `useAnalytics` sends `timeZone`
  - Verify: `npx vitest run server/api/analytics app/composables`
  - Files:
    - `server/api/analytics/dashboard.get.ts` (+ test)
    - `app/composables/useAnalytics.ts`
  - Depends on: T3

### Checkpoint B

- [x] Focused tests pass
- [x] Typecheck is clean
- [x] Runtime: on `pnpm dev:local`, with a minted JWT, `/api/weekly-goal` and
      `/api/analytics/dashboard` agree for fixture user `me`

## Phase 3: Docs and verification

- [x] **T6: Docs** (S)
  - Acceptance:
    - `docs/API_CONTRACT_WEEKLY_GOAL.md` covers the settings, the progress
      route and the dashboard's time zone change
    - the OpenAPI descriptions are updated
    - CLAUDE.md has a Roadmap entry and a schema note
  - Files: `docs/API_CONTRACT_WEEKLY_GOAL.md`, `CLAUDE.md`, the route files
  - Depends on: T2, T4, T5

- [x] **T7: verify-app** (S)
  - Acceptance: TypeScript, scoped unit tests, build and the smoke check all
    pass
  - Depends on: all
