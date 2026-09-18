# API contract — program runs

Audience: the native iOS client (and anyone else consuming `/api/user-programs`).
Interactive reference: `/api/docs` (Scalar).

## A UserProgram is one run

A `UserProgram` row is a single **run** through a program, not a permanent
"this user has this program" record. A user who finishes Arm Farm and starts it
again ten weeks later has two rows for the same `programId`, each with its own
position, sessions and scheduled workouts. `userProgramId` on sessions and
scheduled workouts therefore identifies the run.

A run is **open** until one of two terminal states is reached:

| Field | Set when | Meaning |
|---|---|---|
| `completedAt` | the final day of the program is completed | Finished. Shown as "Completed" in the library. |
| `archivedAt` | the user unsaves a run that has completed workouts | Removed from the library; history kept. |

A terminal run is never resumed: its position and `completedAt` do not change
again, and the only transition left is a completed run being archived when the
user unsaves it. That is about the run's lifecycle, not its workouts — completed
sessions inside a completed or archived run remain fully editable, and editing
them never reopens or advances the run. At most one open run
exists per `(user, program)`, and at most one run is active per user.

## Endpoints

### `PATCH /api/user-programs/:id/activate`

Activates the run. **If `:id` is a terminal run, the response is a different
run** — the program's open run, or a brand-new one at week 1, day 1 — and its
`id` differs from the path id.

> Always replace your local model with the response body (or refetch
> `GET /api/user-programs/active`). Do not assume the id you sent is the id that
> is now active. Anything cached against the old `userProgramId` — scheduled
> workouts in particular — belongs to the finished run.

`409 Program already active` is returned when the run (or the program's open
run) is already active, and when a concurrent activation wins the race.

This is how "start again" works; there is no separate restart endpoint. Builds
that predate runs get a working restart from the same call.

### `GET /api/user-programs`

Returns **one current run per program**: the open run if there is one,
otherwise the most recently completed run. Archived runs are omitted. Existing
clients that key by `programId` keep working.

`?runs=all` returns every run, including completed and archived ones, newest
first.

Each row now also carries:

| Field | Type | Notes |
|---|---|---|
| `completedAt` | ISO date \| null | |
| `archivedAt` | ISO date \| null | only ever non-null with `runs=all` |
| `runNumber` | int | 1-based, by `startedAt` within the program |
| `completedRunCount` | int | completed runs of this program, including archived |

Suggested UI: when the current run has `completedAt`, show a "Completed" badge
and label the primary action "Start again" (calls activate).

### `POST /api/user-programs`

Creates a new open run. `409 Program already saved` only when the program
already has an open run — completed and archived runs do not block a re-save.

### `DELETE /api/user-programs/:id`

Removes the **program** from the library without destroying workout history.
Every non-archived run of that program is processed:

- no completed workouts → the run is deleted;
- has completed workouts → the run is archived (`archivedAt`), deactivated, and
  its unfinished sessions and scheduled workouts are deleted.

Response: `{ "success": true, "archived": boolean }` — `archived` is true when
any run was kept as history. Completed workouts on archived runs still appear in
`/api/history`, and archiving changes nothing about what can be edited: notes and
`completedAt` via `PATCH /api/workouts/:id`, and logged sets via
`POST /api/workouts/:id/sets` and `PATCH|DELETE /api/workouts/:id/sets/:setId`,
all work on a completed session — as do the structural edits (extra sets, ad-hoc
sets, skip, swap, core-circuit setup). Every edit route gates on ownership only
(`404` otherwise), never on session status or program state; the full contract is
in [`API_CONTRACT_EDITING_COMPLETED_WORKOUTS.md`](./API_CONTRACT_EDITING_COMPLETED_WORKOUTS.md).

### `PATCH /api/workouts/:id/complete`

When the final day is completed the run gets `isActive: false` and
`completedAt` (the session's `completedAt`, else now). `programCompleted: true`
is returned as before. A session completed on an already-finished run changes
nothing on the run and returns `programCompleted: false`.

### `POST /api/workouts`

New `409 This day is already completed` on the live path when the run's current
day already has a completed session. Unreachable in normal use; if you see it,
call activate to restart the program.

## Known limits

- Retroactive sessions (`weekNumber`/`dayNumber` in the body) still require the
  run to be active, so missed days on a finished run cannot be back-filled.
- History rows do not yet expose `runNumber`.
