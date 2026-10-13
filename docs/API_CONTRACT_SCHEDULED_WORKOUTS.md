# API contract: scheduled workouts

The client contract for putting workouts on dates. A scheduled workout is
one of two kinds:

- a **program day**: a week and day of one run (`UserProgram`)
- a **Strength on the Go workout**: a `StandaloneWorkout`, outside any program

Every route needs auth (Bearer or session) and acts only on the caller.

## The rules

- A run schedules each of its days at most once, and at most one of its days
  per date.
- A user schedules **at most one standalone workout per date**.
- A program day and a standalone workout **can share a date**, for example a
  finisher after the program workout.
- Scheduling never changes a run's position, and starting a workout never
  needs a schedule.
- Completing or unsaving a run deletes its scheduled days. Standalone rows
  are unaffected.

## The object

```jsonc
{
  "id": "cm…",
  "userId": "cm…",              // the owner; may be null on an older program day
  "scheduledDate": "2026-10-15T00:00:00.000Z", // a calendar date; ignore the time
  "createdAt": "2026-10-12T18:04:11.000Z",

  // Program day: all three set, standaloneWorkoutId null
  "userProgramId": "cm…",
  "weekNumber": 3,
  "dayNumber": 2,

  // Standalone: set, and the three fields above null
  "standaloneWorkoutId": null
}
```

Tell the kinds apart with `standaloneWorkoutId !== null`. Don't rely on
`userId`: a program day saved before this change has `userId: null` until a
later migration fills it in.

## Schedule: `POST /api/scheduled-workouts`

Send exactly one kind. `scheduledDate` is `YYYY-MM-DD`.

| Kind | Body |
|---|---|
| Program day | `{ "userProgramId": "…", "weekNumber": 3, "dayNumber": 2, "scheduledDate": "2026-10-15" }` |
| Standalone | `{ "standaloneWorkoutId": "…", "scheduledDate": "2026-10-15" }` |

`201` with `{ "scheduledWorkout": { … } }`.

| Status | When |
|---|---|
| `400` | A field is missing or invalid, or a standalone body also sends `userProgramId`, `weekNumber` or `dayNumber`. A `scheduledDate` that is a timestamp (with or without an offset) or not a real day, such as `2026-02-30`, is invalid. |
| `403` | The run belongs to another user. |
| `404` | No such run, or no such standalone workout. |
| `409` | Program day: the day or the date is already scheduled on that run. Standalone: the caller already has a standalone workout on that date. |

To move a workout to another date, `DELETE` it and `POST` it again.

## List: `GET /api/scheduled-workouts`

Both forms take optional `from` and `to` (`YYYY-MM-DD`, inclusive), and return
`{ "scheduledWorkouts": [ … ] }` ordered by date.

| Query | Returns |
|---|---|
| `?userProgramId=…` | That run's program days only, in the object shape above. Unchanged from before. `403`/`404` as for `POST`. |
| no `userProgramId` | **Everything** the caller has scheduled, both kinds, across all their runs. Use this for a calendar. |

The calendar form adds `standaloneWorkout` to each row, so a standalone row
can be labelled without another request:

```jsonc
"standaloneWorkout": { "id": "cm…", "name": "Arms Only", "category": "Arms" } // null on a program day
```

`name` can be `null`, so have a fallback label ready.

## Unschedule: `DELETE /api/scheduled-workouts/:id`

Either kind. `200` with `{ "success": true }`, `403` if it belongs to another
user, `404` if there is no such row.

## Reminders

The reminder sweep covers **program days only** for now, on the active run.
Scheduled standalone workouts don't get a `WORKOUT_REMINDER` yet.
