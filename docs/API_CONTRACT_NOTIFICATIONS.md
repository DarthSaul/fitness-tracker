# API contract: notifications

The client contract for the notifications inbox and push. The design is in
[`notifications/SPEC-notifications.md`](notifications/SPEC-notifications.md).
Every route needs auth (Bearer or session) and acts only on the caller's own
notifications.

## Types

| `type` | `actor` | `target` | `data` |
|---|---|---|---|
| `FOLLOW_REQUEST` | requester | `followId` (accept via `POST /api/follow-requests/:followId/accept`) | `{}` |
| `NEW_FOLLOWER` | follower | — | `{}` |
| `FOLLOW_ACCEPTED` | the user you asked | — | `{}` |
| `POST_REACTION` | reactor | `postId` | `{ emoji }` |
| `WORKOUT_REMINDER` | `null` | `scheduledWorkoutId` | `{ programName, weekNumber, dayNumber }` |
| `WORKOUT_UNFINISHED` | `null` | `workoutSessionId` or `standaloneSessionId` | `{}` |

Clients must ignore unknown `type` values, because new types will be added
without a version bump.

> Rollout: the four social types are live. `WORKOUT_REMINDER` and
> `WORKOUT_UNFINISHED` come from a scheduled job that runs every 5 minutes, so
> they can arrive up to 5 minutes after they fall due.

What the workout types do:
- **`WORKOUT_UNFINISHED` fires once per session,** 4 hours after a workout
  started if it's still in progress.
  - It covers program workouts and Strength on the Go.
  - Completing the workout dismisses it.
  - Deep-link to the session through `target`, so the user can finish it and
    correct its date.
- **`WORKOUT_REMINDER` fires once per scheduled workout,** on its scheduled
  date, once the user's local `workoutReminderTime` has passed.
  - It needs `timezone` in preferences. Without one, no reminder fires.
  - It's skipped if that program day already has a session, or the program run
    has ended.

What the social types do:
- **`FOLLOW_REQUEST` disappears from the list** once the request is accepted,
  declined or cancelled. Treat a `404` from accepting it as "already handled".
- **`NEW_FOLLOWER` and `POST_REACTION` fire once per person.** One per
  follower; one per reactor per post, however many emoji they add.
- **Making your profile public** sends `FOLLOW_ACCEPTED` to everyone whose
  request was pending.
- **Blocking someone** removes every notification between the two of you, in
  both inboxes.

## Item

```jsonc
{
  "id": "clx…",
  "type": "POST_REACTION",
  "status": "unread",              // "unread" | "read" | "dismissed"
  "createdAt": "2026-10-02T12:00:00.000Z",
  "readAt": null,
  "actor": { "id": "…", "name": "Ann", "username": "ann", "avatarUrl": null, "profileVisibility": "PUBLIC" },
  "target": { "postId": "…" },
  "data": { "emoji": "🔥" }
}
```

`GET /api/notifications` never lists a dismissed notification, but
`PATCH /api/notifications/:id` returns one with `status: "dismissed"`.

Build the display text from `type` and `data`. `target` holds only ids; fetch
the resource itself. If that returns 404, the resource is gone: show the
notification without a deep link.

## Routes

### `GET /api/notifications`
Query: `status=unread|all` (default `all`), `limit` (1–50, default 20),
`before` + `beforeId` (the `createdAt` and `id` of the last item; send both or
neither).

→ `200 { notifications: Item[] }`, newest first. An empty page means you've
reached the end. `400` on a bad parameter.

### `GET /api/notifications/unread-count`
→ `200 { count }`. This is the same number the push sends as `badge`.

### `PATCH /api/notifications/:id`
Body: `{ status: "read" | "unread" | "dismissed" }`.

→ `200 { notification: Item }`, or `404` if the notification isn't yours or
doesn't exist.
- `dismissed` removes it from the list and from the badge count.
- `read` on a dismissed notification restores it.

### `POST /api/notifications/read-all`
Body: `{ before?: ISO timestamp }`. Send the `createdAt` of the newest item on
screen. Defaults to now.

→ `200 { count }`.

### `GET /api/notifications/preferences`
→ `200 { push: { [type]: boolean }, timezone: string | null, workoutReminderTime: "HH:MM" }`

Every type is listed. Push defaults to `true`, the reminder time to `"08:00"`.

### `PATCH /api/notifications/preferences`
Body: any subset of the GET shape, with at least one recognised change.

→ `200`, with the full GET shape. `400` on:
- an unknown type
- a value that isn't a boolean
- a timezone that isn't an IANA zone (send `TimeZone.current.identifier`).
  Raw offset strings such as `+05:30` or `-08:00` are rejected. Named IANA
  zones are accepted, including `Etc/GMT±N` (which has no daylight saving)
- a time that isn't `HH:MM` in 24-hour form
- no recognised change, e.g. `{}`, `{ "push": {} }`, or only unknown fields

**iOS: send `timezone` at sign-in and whenever it changes.** Without it, no
`WORKOUT_REMINDER` fires.

Turning a type's push off still records it in the inbox.

## Push payload (APNs)

```jsonc
{
  "aps": { "alert": { "title": "New reaction", "body": "Ann reacted 🔥 to your post" }, "badge": 3, "sound": "default" },
  "notificationId": "clx…",
  "type": "POST_REACTION",
  "target": { "postId": "…" }
}
```

When the user taps a push:
1. Deep-link using `type` and `target`.
2. `PATCH /api/notifications/:notificationId` with `{ "status": "read" }`.

Pushes go to every device registered through `POST /api/devices/register`. A
notification that is read in-app before its push goes out is never pushed.
