# API contract: weekly workout goal

The client contract for the weekly goal card ("1/4 this week"). The design is
in [`weekly-goal/SPEC-weekly-goal.md`](weekly-goal/SPEC-weekly-goal.md).

- Every route needs auth (Bearer or session).
- Every route acts only on the caller.
- The goal is private: it never appears in any response about another user.

## Settings: `GET` / `PATCH /api/auth/me`

Three fields are added to the existing profile response:

| Field | Type | Default | Meaning |
|---|---|---|---|
| `weeklyWorkoutGoalEnabled` | boolean | `false` | Whether the goal is on. Show the card only when `true`. |
| `weeklyWorkoutGoal` | integer, 1–7 | `3` | The target. Kept while the goal is off. |
| `weekStartDay` | `"SUNDAY"` … `"SATURDAY"` | `"SUNDAY"` | The first day of the user's week. |

`PATCH` takes any subset of the three, alone or with the other settings. It
returns the full profile, the same as `GET`.

| User action | Body |
|---|---|
| Turn on with a number | `{ "weeklyWorkoutGoalEnabled": true, "weeklyWorkoutGoal": 4 }` |
| Change the number | `{ "weeklyWorkoutGoal": 5 }` |
| Turn off, or "remove" | `{ "weeklyWorkoutGoalEnabled": false }` |
| Turn back on | `{ "weeklyWorkoutGoalEnabled": true }`. This restores the last number. |
| Change the week start | `{ "weekStartDay": "MONDAY" }` |

- **There is no delete.** "Remove" is "turn off", and the number is kept so
  that turning the goal back on restores it.
- **Changing the number does not touch the toggle**, and the reverse is also
  true. Sending a number while the goal is off saves it, and the goal stays
  off.
- **`400` and nothing is saved** in these cases:
  - `weeklyWorkoutGoal` is not a whole number from 1 to 7. That includes
    `null`, `0`, `8`, `4.5` and `"4"`.
  - `weeklyWorkoutGoalEnabled` is not a boolean.
  - `weekStartDay` is not one of the seven uppercase day names.

  A request with any bad field saves none of its fields.

## Progress: `GET /api/weekly-goal`

```http
GET /api/weekly-goal?timeZone=America/Chicago
```

```jsonc
{
  "enabled": true,
  "goal": 4,
  "completedThisWeek": 1,
  "weekStartDay": "SUNDAY",
  "weekStart": "2026-10-04T05:00:00.000Z", // inclusive
  "weekEnd": "2026-10-11T05:00:00.000Z",   // exclusive
  "timeZone": "America/Chicago"            // the zone actually used
}
```

The card reads `completedThisWeek` / `goal`, for example "1/4 this week".

- **Send `timeZone`** (`TimeZone.current.identifier`) on every call, so the
  week follows the phone, including while travelling.
  - Without it, the server uses the zone saved in notification preferences.
    Failing that, it uses UTC.
  - A value that isn't an IANA zone name returns `400`. That includes a raw
    offset such as `-05:00`.
- **The week** runs from 00:00 on `weekStartDay` to the same time seven days
  later, in that zone.
  - In a week with a DST change it is 167 or 169 hours long. Use `weekStart`
    and `weekEnd` as they are; don't add 7 days.
- **What counts:** every completed workout, program or Strength on the Go,
  whose completion date (`completedAt`) falls in the week.
  - In-progress workouts don't count.
  - Editing a workout's date, or backdating it when you complete it, moves it
    to that date's week.
- **The count is returned even when `enabled` is `false`.** Hide the card in
  that case, rather than skipping the call.
- `completedThisWeek` can exceed `goal`, so render "5/4" or a done state as
  you prefer.
- **When to refetch:**
  - after completing, deleting or re-dating a workout
  - after a settings `PATCH`
  - when the app returns to the foreground, because the week may have rolled
    over

## Analytics dashboard: `GET /api/analytics/dashboard`

`sessionsThisWeek` now uses the same week as the card, so the two always agree.

- It follows the user's `weekStartDay`. Before this change it always started
  on Monday.
- It accepts the same `timeZone` param, and an invalid one returns `400`. The
  old `tzOffset` (minutes east of UTC) still works when `timeZone` is absent,
  but it ignores DST changes, so send `timeZone` instead.
- It returns `404` if the user record is missing. Nothing else in the
  response shape changes.
