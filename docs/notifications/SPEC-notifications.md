# Spec: notifications v1 (API)

Status: **approved 2026-10-02** — decisions in §9.

## 1. Objective

Give every user one durable **inbox** of things that happened to them or need
their attention, and deliver each item as an APNs push when they have a
registered device. v1 is API-only; iOS wiring and web UI come later.

Users: the native iOS app (push + inbox screen) and, later, the web client
(inbox only — there is no web push).

## 2. Notification types (v1)

| Type | Recipient | Fires when | Source route / job |
|---|---|---|---|
| `FOLLOW_REQUEST` | followee | someone requests to follow a PRIVATE profile | `POST /api/following` (PENDING) |
| `NEW_FOLLOWER` ➕ | followee | someone follows a PUBLIC profile (accepted instantly) | `POST /api/following` (ACCEPTED) |
| `FOLLOW_ACCEPTED` | follower | their request was accepted | `POST /api/follow-requests/:id/accept`, **and** each request auto-accepted by `PATCH /api/auth/me` going public ➕ |
| `POST_REACTION` | post author | someone reacts to their post | `PUT /api/posts/:id/reactions/:emoji` |
| `WORKOUT_REMINDER` | owner | a `ScheduledWorkout` is due today | sweep job |
| `WORKOUT_UNFINISHED` | owner | an `IN_PROGRESS` session (program **or** standalone ➕) is still open 4 h after `startedAt` | sweep job |

➕ = additions to the original list:
- **`NEW_FOLLOWER`.** A follow on a PUBLIC profile is accepted at once, so no
  request is created. Without this type, public users never hear about new
  followers.
- **Auto-accepted requests.** When a user goes public, every pending request is
  accepted in bulk, and each requester should still get `FOLLOW_ACCEPTED`.
- **Standalone sessions.** Strength on the Go sessions can be left open in the
  same way as program sessions.

Not in v1 (backlog): `NEW_POST` from someone you follow, mid-week progress.

### Rules every type obeys

- **Never notify yourself.** If the actor is the recipient, nothing is created.
  For example, reacting to your own post creates no notification.
- **Blocks are absolute and never disclosed.** No notification is created
  between users when a block exists in either direction, checked at creation.
  Creating a block deletes every notification between the pair, in the same
  transaction, so the inbox never reveals the blocked user.
- **ADR 001.** No notification carries another user's workout data. Workout
  types go only to the session owner.
- **Stale notifications are retracted.** If the request behind a
  `FOLLOW_REQUEST` is cancelled, declined or accepted, that notification is
  deleted, because actioning it would 404. A `WORKOUT_UNFINISHED` notification
  is auto-dismissed when its session completes or is deleted. Reactions and
  follows that are removed later are *not* retracted, since they did happen.
  Retracting them would also let anyone erase a notification by
  un-reacting quickly. Push alerts that were already delivered can't be
  recalled.

## 3. Data model

```prisma
enum NotificationType {
  FOLLOW_REQUEST
  NEW_FOLLOWER
  FOLLOW_ACCEPTED
  POST_REACTION
  WORKOUT_REMINDER
  WORKOUT_UNFINISHED
}

model Notification {
  id          String           @id @default(cuid())
  recipientId String
  type        NotificationType
  /// The user who caused it (social types). Null for system types.
  actorId     String?
  /// Typed references for deep links + retraction. Each nulls/cascades with its source.
  postId                String?
  followId              String?   // no FK: Follow rows are hard-deleted on decline; retraction is explicit
  workoutSessionId      String?
  standaloneSessionId   String?
  scheduledWorkoutId    String?
  /// Render snapshot taken at creation: { emoji }, { programName, weekNumber, dayNumber }, …
  data        Json             @default("{}")
  /// Idempotency: one row per logical event. e.g. "reaction:{postId}:{actorId}",
  /// "unfinished:{sessionId}", "reminder:{scheduledWorkoutId}".
  dedupeKey   String           @unique
  createdAt   DateTime         @default(now())
  readAt      DateTime?
  dismissedAt DateTime?
  /// Push delivery outbox. pushedAt set once APNs accepted it (or there was no device).
  pushedAt    DateTime?
  pushAttempts Int             @default(0)

  recipient User  @relation("NotificationsReceived", fields: [recipientId], references: [id], onDelete: Cascade)
  actor     User? @relation("NotificationsCaused",   fields: [actorId],     references: [id], onDelete: Cascade)
  post      Post? @relation(fields: [postId], references: [id], onDelete: Cascade)
  // workoutSession / standaloneSession / scheduledWorkout: onDelete: Cascade

  // Inbox: a recipient's non-dismissed notifications, newest first (keyset).
  @@index([recipientId, dismissedAt, createdAt(sort: Desc), id(sort: Desc)])
}
// Raw SQL: partial index for the badge count
//   CREATE INDEX "Notification_unread_idx" ON "Notification" ("recipientId")
//   WHERE "readAt" IS NULL AND "dismissedAt" IS NULL;
// Raw SQL: CHECK ("actorId" IS NULL OR "actorId" <> "recipientId")
```

**Status is derived, not stored.** The API exposes
`status: 'unread' | 'read' | 'dismissed'`: `dismissed` if `dismissedAt` is
set, else `read` if `readAt` is set, else `unread`. Two timestamps keep the
"when" for free and let dismissing a notification keep its read state.

**Why `dedupeKey`.** The sweep runs repeatedly and route handlers can retry,
so every write is `createMany({ skipDuplicates: true })` or an upsert on
`dedupeKey`. That makes each event idempotent without a lock.

**Reactions are one notification per (post, reactor), ever.** The dedupe key
is `reaction:{postId}:{actorId}`, and the first emoji wins.
- If the same person adds three emoji, you get one notification.
- Un-reacting and reacting again doesn't notify you again.
- So there is no separate push throttle: the dedupe key already caps it.

Aggregating different people ("Ana and 3 others") at read time is deferred.

**Cascades.** `DELETE /api/auth/me` covers the new table with no route
change: notifications are deleted when their recipient or actor is deleted.

## 4. API (iOS + web contract)

All routes are authenticated and owner-only. Another user's notification
returns `404`.

| Route | Purpose |
|---|---|
| `GET /api/notifications?status=unread\|all&limit=&before=&beforeId=` | Inbox, newest first. Same keyset cursor as `GET /api/history`. Excludes dismissed. Actor rendered as `PublicUser`; actors you now block, or who block you, are filtered out. |
| `GET /api/notifications/unread-count` | `{ count }` for the badge. |
| `PATCH /api/notifications/:id` `{ status: 'read' \| 'unread' \| 'dismissed' }` | Changes one notification's status. `read` keeps the first `readAt` and un-dismisses. `dismissed` also marks it read. |
| `POST /api/notifications/read-all` `{ before? }` | Marks everything up to `before` as read. The cursor stops a notification that arrives mid-tap from being silently read. |
| `GET\|PATCH /api/notifications/preferences` | `{ push: { [type]: boolean }, timezone, workoutReminderTime: "HH:MM" }`. GET lists every type with its default filled in. PATCH accepts any subset. |
| `POST /api/internal/notifications/sweep` | **Not user-facing.** Runs scheduled work; needs `Authorization: Bearer $NOTIFICATIONS_CRON_SECRET`, compared in constant time. Kept under `/api/internal/` and allow-listed in the auth middleware. |

Item shape:

```jsonc
{
  "id": "…", "type": "POST_REACTION", "status": "unread",
  "createdAt": "…", "readAt": null,
  "actor": { "id": "…", "name": "…", "avatarUrl": "…" },   // null for system types
  "target": { "postId": "…" },                              // deep-link ids only
  "data": { "emoji": "🔥" }
}
```

The client builds the display text from `type` + `data` (localisable). The push
payload carries a server-built English `alert`, plus
`{ notificationId, type, target }` for the deep link and
`badge = unread count`.

## 5. Creation + delivery pipeline

```
domain write (route tx) ──► notify(tx, {...})  ── inserts Notification row (same tx)
                                   │
                after commit ──────┴─► event.waitUntil(deliverPush(id))   best-effort, never fails the request
                                                    │
sweep (every 5 min) ── retries rows with pushedAt IS NULL AND pushAttempts < 3 AND createdAt > now()-1h
```

- **The transactional outbox.** The notification row is written in the same
  transaction as the event that caused it, so a request that rolls back can't
  leave a notification behind, and a request that commits can't lose one.
  - Push delivery happens after commit.
  - A failed push never turns a `201` into a `500`.
  - The sweep catches up on anything `waitUntil` dropped, for example when a
    cold function is frozen.
- **One helper module, `server/utils/notifications.ts`.**
  - It holds `notify`, `retract`, `deliverPush`, the push text per type, and
    the block and self checks.
  - Routes make one call and contain no notification logic.
- **`apns.ts` changes.**
  - `sendPush` is extended to accept a custom payload (`notificationId`,
    `type`, `target`) and a `badge`.
  - It reports per-device success, so `pushedAt` and `pushAttempts` can be
    set.
- **Already-seen notifications aren't pushed.** If a notification is read,
  dismissed or retracted before its push goes out, `deliverPush` skips it. If
  its type's push is turned off, it is marked delivered without being sent.

## 6. Scheduled work (the sweep)

One idempotent job, safe to run concurrently, because every insert is guarded
by `dedupeKey`.

1. **`WORKOUT_UNFINISHED`.** Finds `WorkoutSession` and
   `StandaloneWorkoutSession` rows where `status = IN_PROGRESS` and `startedAt`
   falls between `now − 48h` and `now − 4h`. Each gets
   `dedupeKey = unfinished:{sessionId}`.
   - Only `IN_PROGRESS` sessions qualify. `EDITING` is a user deliberately
     correcting a finished workout, so it is skipped.
   - The 48 h ceiling stops the first deploy from pinging every abandoned
     session in the database.
   - Because of the dedupe key, a session reminds at most once.
2. **`WORKOUT_REMINDER`.** Finds `ScheduledWorkout` rows due today in the
   user's timezone, once the user's reminder time has passed. Each gets
   `dedupeKey = reminder:{scheduledWorkoutId}`.
   - A reminder is skipped if a session for that `(userProgramId, week, day)`
     has already started or completed.
   - It is also skipped if the run is terminal (`completedAt` / `archivedAt`).
3. **Push retry** of the outbox (§5).
4. **Retention.** Dismissed notifications are deleted after 30 days, and all
   notifications after 90 days.

Each run logs a single `notifications.sweep` line with counts per step.

## 7. Observability

- Log lines:
  - `notification.created` with `{ type, recipientId, notificationId }`
  - `notification.push` with `{ outcome: sent|no_device|failed|revoked }`
  - `notifications.sweep` with counts and duration
- Push failures go to the logs, not Sentry. They are expected (revoked
  tokens). A sweep that throws reaches Sentry through the normal 5xx path.
- Alert on staleness: if no `notifications.sweep` line appears for 30 minutes,
  the scheduler is down.

## 8. Testing

Every route and helper gets a Vitest unit test written first (TDD), with
Prisma mocked. Add `notification` to the global mock in `vitest.setup.ts`.
Required cases:
- Each trigger route creates a notification in its transaction.
- Nothing is created when the actor blocks the recipient, or the recipient
  blocks the actor, or the actor is the recipient.
- Creating a block deletes the notifications between the pair.
- `FOLLOW_REQUEST` is retracted on accept, decline and cancel.
- A second run of the sweep creates no duplicates.
- A session that completes after the 4 h mark has its `WORKOUT_UNFINISHED`
  notification auto-dismissed.
- Another user's notification returns 404.
- The sweep returns 401 without the secret.
- A push failure doesn't fail the route that triggered it.

## 9. Decisions (2026-10-02)

1. **Scheduler: Supabase `pg_cron` + `pg_net`.**
   - Every 5 minutes it `POST`s to `/api/internal/notifications/sweep` with
     `Authorization: Bearer <secret>`.
   - The secret is kept in Supabase Vault, never in the migration.
   - It's free and already part of the stack. Vercel Hobby cron runs at most
     once a day, which is too coarse.
2. **Reminder time and timezone: one setting per user.**
   - `User.timezone` is an IANA zone sent by the client.
   - `User.workoutReminderMinute` is the local time in minutes after midnight,
     default 480 (08:00).
   - A reminder fires on `scheduledDate` once that local time has passed.
   - A user with no timezone gets no `WORKOUT_REMINDER`. We don't guess, and
     the iOS wiring sends the timezone.
3. **Preferences ship in v1, as push toggles per type.**
   - A `NotificationPreference(userId, type, pushEnabled)` row exists only
     when the user has changed the default. A missing row means push is on.
   - The inbox row is always written; a disabled type only suppresses the
     push.
4. **Delivery: three stacked PRs.**
   1. Schema, `notify` / `retract` / push helpers, and the inbox and
      preferences API.
   2. Social triggers: follow, accept, auto-accept, reaction, and block
      cleanup.
   3. The sweep: the `pg_cron` job, `WORKOUT_UNFINISHED`, `WORKOUT_REMINDER`,
      push retry and retention.

## 10. Boundaries

- **Always:**
  - Use additive migrations (production shares the DB).
  - Write notifications in the same transaction as their source event.
  - Make every write idempotent through `dedupeKey`.
- **Ask first:**
  - New dependencies.
  - Changes to social routes beyond the one-line `notify` / `retract` calls.
- **Never:**
  - Notify across a block.
  - Put another user's workout data in a notification.
  - Let a push failure fail a user request.
  - Expose the sweep without its secret.
