# Implementation Plan: Weekly workout goal

## Overview

The spec is [`docs/weekly-goal/SPEC-weekly-goal.md`](../docs/weekly-goal/SPEC-weekly-goal.md).
The tasks are in [`todo-weekly-goal.md`](todo-weekly-goal.md). This plan
covers:

- three owner-only settings on `/api/auth/me`
- a `GET /api/weekly-goal` progress route
- the analytics dashboard's `sessionsThisWeek` moving onto the same week
  definition

It is all on one branch, `feat/weekly-workout-goal`.

`tasks/plan.md` and `tasks/todo.md` still belong to Social, which has open
items, so they are left untouched.

## Architecture decisions

- **One week function, `weekBounds(now, startDay, zone)`** in
  `server/utils/week.ts`, is used by both the card and the dashboard, so they
  cannot disagree.
- **`zone` is an IANA name or a fixed offset in minutes.** The offset form
  exists only for the dashboard's legacy `tzOffset` param, which web bundles
  cached by the PWA still send.
- **Local midnight is converted to UTC with a two-pass offset lookup through
  `Intl`.** `weekEnd` is computed the same way, not as `+7 days`, so weeks
  that cross a DST change are correct. No date library is added.
- **Counting uses two `count()` queries**, one program and one standalone, on
  the existing `@@index([userId, status])`. The dashboard keeps its own
  in-memory filter, because it already loads every session, but it uses
  `weekBounds`.
- **The migration is written with `prisma migrate dev` against the local stack
  only** (`.env.dev` → 127.0.0.1:54322). The raw `CHECK` is appended by hand.

## Dependency graph

```text
T1 schema + migration
 ├── T2 /auth/me settings (meSelect, parsers, PATCH)
 └── T3 week util (weekBounds, parseTimeZoneParam, completedWorkoutsBetween)
       ├── T4 GET /api/weekly-goal
       └── T5 dashboard + web useAnalytics
T6 docs (contract, OpenAPI, CLAUDE.md)  ← T2, T4, T5
T7 verify-app + runtime check           ← all
```

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| DST arithmetic is wrong at the week edges | Medium | Unit tests on the Chicago November and March weeks, asserting exact UTC instants |
| A zone whose DST change lands at midnight (e.g. `America/Santiago`), where local 00:00 doesn't exist | Low | The two-pass lookup lands on the first valid instant. Documented in the function's comment. |
| The dashboard's Sunday default changes a number web users already see | Low | Intended and recorded in the spec. The web has no week-start setting yet, so it follows the stored value set from iOS. |
| A migration accidentally pointed at the hosted DB | High | Use only the `db:local:*` scripts, which load `.env.dev`. The host is checked before running. |
| Existing dashboard test assumes Monday | Low | Update it to set the stored `weekStartDay` explicitly |

## Open questions

None.
