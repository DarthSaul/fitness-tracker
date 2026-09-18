# API contract — editing completed workouts

Audience: the native iOS client. Interactive reference: `/api/docs` (Scalar).

## The rule

**Any workout session the user owns is editable, in any status, regardless of
program state.** No edit route checks for an active program, compares the
session to the program's current week/day, or requires the session to be
`IN_PROGRESS`. The only gate is ownership (`404` otherwise).

An edit screen therefore needs only a session id. It must not be reachable
solely through the active program's "manage" view — a user with no active
program still has editable history.

## Finding sessions

| Need | Endpoint | Requires active program |
|---|---|---|
| All completed workouts, newest first | `GET /api/history` (program + standalone) or `GET /api/workouts/history` | No |
| Sessions of one specific program, by week/day | `GET /api/user-programs/:id/sessions` | No |
| Sessions of the active program | `GET /api/user-programs/active/sessions` | Yes (`404` without one) |
| One session + its day template | `GET /api/workouts/:id` | No |

`/:id/sessions` and `/active/sessions` return the same `{ sessions }` shape
(each with `_count.completedSets`), ordered by week, day, `startedAt`, then `id`. Use
`/:id/sessions` to build a manage-style grid for an inactive or finished
program; the ids come from `GET /api/user-programs`.

## Edit routes (all work on `COMPLETED`, `EDITING` and `IN_PROGRESS`)

| Action | Route |
|---|---|
| Edit notes and/or completed date | `PATCH /api/workouts/:id` — `{ notes?, completedAt? }`; `completedAt` may not be in the future |
| Log a template set | `POST /api/workouts/:id/sets` |
| Edit a logged set | `PATCH /api/workouts/:id/sets/:setId` |
| Delete a logged set | `DELETE /api/workouts/:id/sets/:setId` |
| Add an extra set to an exercise | `POST /api/workouts/:id/exercises/:programExerciseId/extra-sets` |
| Delete an extra set | `DELETE /api/workouts/:id/extra-sets/:completedSetId` |
| Add a set for a user-named exercise | `POST /api/workouts/:id/ad-hoc-sets` |
| Skip / un-skip an exercise | `POST` / `DELETE /api/workouts/:id/exercises/:programExerciseId/skip` |
| Swap an exercise | `POST /api/workouts/:id/exercises/:programExerciseId/swap` |
| Save / delete the core circuit | `PUT` / `DELETE /api/workouts/:id/core-workout` |
| Mark the core circuit done | `PATCH /api/workouts/:id/core-workout/complete` |

Previously the extra-set, ad-hoc, skip, un-skip, swap and core-circuit `PUT`
routes returned `409 Session is not in progress` for anything but an
in-progress session. That response no longer exists.

### Behaviour to design around

- **Skip and swap are destructive.** Both delete every set already logged for
  that exercise in the session (template and extra) and return
  `deletedSetCount`. On a finished workout that is real history — confirm with
  the user first, as the web swap drawer does.
- `POST …/sets` validates the set against the **session's own** week/day, not
  the program's current position.
- `PUT …/core-workout` resets the circuit's `completedAt` only on an
  in-progress session. On a finished session the plan is replaced and
  completion is kept.
- Editing never moves the program: `currentWeek`/`currentDay` change only in
  `PATCH /api/workouts/:id/complete`, which rejects an already-completed
  session.
- Analytics date a workout by the session's `completedAt`, so sets added later
  do not shift it; changing `completedAt` does.

### Still not possible

- `DELETE /api/workouts/:id` rejects a `COMPLETED` session (`409`).
- Creating a session for a past day (`POST /api/workouts` with
  `weekNumber`/`dayNumber`) requires an active program.
