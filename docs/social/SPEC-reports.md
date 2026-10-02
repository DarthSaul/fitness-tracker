# Spec: reports

Module of [CAPABILITY_MAP.md](CAPABILITY_MAP.md). Shared commands, structure,
style, testing and boundaries are defined there. Builds on `posts` and
`user-discovery`. Completes the safety pair with `blocking` (#131) for **App
Store Guideline 1.2** (user-generated content): a way to report objectionable
content and users, and a way to block them.

## Objective

Any user can report a post they can see, or another user, with a reason and
optional details. Each report is stored for moderation together with a snapshot
of what was reported, so the evidence survives the author editing or deleting
it. A moderator is alerted when a report arrives. There is no admin UI: a
moderator reviews and resolves reports in the database.

## Decisions (approved 2026-10-01)

1. **One route, `POST /api/reports`**, with exactly one target:
   - `{ postId, reason, details? }` reports a post,
   - `{ userId, reason, details? }` reports a user (their profile, name or
     avatar).
2. **A fixed list of reasons**, so reports can be triaged and counted:
   `SPAM`, `HARASSMENT`, `HATE`, `SEXUAL_CONTENT`, `VIOLENCE`, `SELF_HARM`,
   `IMPERSONATION`, `OTHER`. `details` is optional free text, up to 1,000
   characters, for every reason, including `OTHER`.
3. **You can only report what you can see.**
   - **A post:** visible to you, through the shared `requireVisiblePost`
     gate. Otherwise it's `404`, so a report never reveals a hidden post.
   - **A user:** any user other than yourself (self is `400`), except one who
     has blocked you. That case is `404`, exactly as their profile is, so a
     report never reveals a block.
   - **Reporting someone *you* blocked is allowed**, because harassment is
     often reported after blocking. It discloses nothing you don't know.
     Their **posts**, though, are hidden from you once blocked, so the app
     should offer "Report" before "Block" (see the contract notes).
4. **Snapshot at report time**, stored on the report:
   - **A post:** its author, its text, its photo count, and whether it shared
     a workout.
   - **A user:** their name and avatar URL.

   Photos aren't copied. Deleting the post deletes its photos, and copying
   images into a moderation store is a larger decision that is out of scope.
5. **Reports outlive the post but not the people.**
   - Deleting the reported post sets `postId` to null and keeps the report
     and its snapshot. Otherwise, deleting a post would erase the evidence
     against it.
   - Deleting the reporter's account or the reported user's account deletes
     the report (`onDelete: Cascade`, per the initiative's boundary). Account
     deletion removes that person's content everywhere, including copies
     held in reports.
6. **A repeat report is a no-op.** Reporting the same post, or the same user,
   again returns `200` and changes nothing. The first report stands, which
   stops one person flooding the moderation queue. Raw partial unique indexes
   back this up:
   - `(reporterId, postId)` where `postId` is set,
   - `(reporterId, reportedUserId)` for user reports.
7. **The moderator is alerted through Sentry.** For each new report, the route
   calls `Sentry.captureMessage('social.report', 'warning')`, tagged with the
   report id, the target type and the reason. That alert carries **no** text
   or details.
   - **Why Sentry:** an alert rule on that message emails you within minutes,
     with no new dependency or service. Apple expects objectionable content
     to be acted on within 24 hours.
   - **One issue per report:** the message is fingerprinted with the report id
     (added during implementation). Otherwise every report would group into
     one Sentry issue, and a "new issue" alert would fire only once, ever.
   - **Also logged:** a structured `social.report` pino log line.
   - **One-time setup:** you add the Sentry alert rule; I'll write the steps.
8. **Resolving is done in SQL for now.** `resolvedAt` and `resolution`
   (free text) are set by hand. A moderation API or UI is a later initiative.
9. **Rate limit:** 20 reports per hour per user (`rateLimitByKey`).

## Data model

```prisma
enum ReportReason {
  SPAM
  HARASSMENT
  HATE
  SEXUAL_CONTENT
  VIOLENCE
  SELF_HARM
  IMPERSONATION
  OTHER
}

model Report {
  id             String       @id @default(cuid())
  reporterId     String
  /// The user reported, or the reported post's author. Always set.
  reportedUserId String
  /// Set for a post report; nulled if the post is deleted (the snapshot stays).
  postId         String?
  /// True for a post report, so it remains one after postId is nulled.
  isPostReport   Boolean
  reason         ReportReason
  details        String?
  /// What was reported, captured at report time: post { body, photoCount,
  /// sharedWorkout } or user { name, avatarUrl }.
  snapshot       Json
  createdAt      DateTime     @default(now())
  resolvedAt     DateTime?
  resolution     String?

  reporter     User  @relation("ReportsMade", fields: [reporterId], references: [id], onDelete: Cascade)
  reportedUser User  @relation("ReportsReceived", fields: [reportedUserId], references: [id], onDelete: Cascade)
  post         Post? @relation(fields: [postId], references: [id], onDelete: SetNull)

  // The moderation queue: unresolved first, oldest first.
  @@index([resolvedAt, createdAt])
  @@index([reportedUserId])
}
```

Storing the post's author on the report as `reportedUserId` has two benefits:
- Reports about one person are found the same way for posts and profiles.
- Deleting the author's account removes reports of their posts too.

**Raw SQL in the migration:**
- **Partial unique indexes:** `(reporterId, postId) WHERE "postId" IS NOT NULL`,
  and `(reporterId, reportedUserId) WHERE NOT "isPostReport"`.
- **A post report deleted along with its post** sets `postId` to null, so the
  first index no longer covers it. Re-reporting a deleted post is impossible
  anyway.
- **`CHECK`** `"reporterId" <> "reportedUserId"`.
- **`CHECK`** `octet_length` limits on `details` and `resolution`, as defence in
  depth.

The migration is additive: a new table and enum that the deployed code never
reads.

## Route: `POST /api/reports`

- **Validate before anything else:**
  - `400` unless exactly one of `postId` and `userId` is given,
  - `400` for an unknown `reason`,
  - `400` for `details` over 1,000 characters (trimmed; an empty string
    becomes null),
  - `400` for reporting yourself, including your own post.
- **Rate limit:** checked next, before any read.
  - **Every request counts, including a repeat**, so a repeat past the limit
    is `429`, not `200`.
  - Checking the limit first stops a flood of repeats from costing
    unthrottled visibility and duplicate lookups.
  - Clients treat `429` as "try later" in any case.
- **Checking the target:**
  - **A post:** `requireVisiblePost`, so a post you can't see is `404`. Then
    read the snapshot fields. Reporting your own post is `400`.
  - **A user:** the user must exist and must not have blocked you, or it's
    `404`. Then read `name` and `avatarUrl`.
- **Writing:**
  - A new report is created → **`201 { id }`**.
  - A report from you on that target already exists → **`200 { id }`** of the
    existing one. A duplicate created concurrently (P2002) is handled the same
    way.
  - If that concurrent winner is gone by the time it's re-read → the target's
    **`404`**. That happens when the post was deleted (its reports' `postId`
    becomes null) or the reported account was deleted (cascade).
- **Alert:** after commit, on `201` only, send the Sentry message and log
  line. A failure to alert is logged and never fails the request, because the
  report is already stored.

## Out of scope

- A moderation UI or API: listing, resolving or acting on reports.
- Removing reported content automatically, or hiding it from the reporter.
  Blocking does that.
- Reporting reactions, photos individually, or workout shares on their own.
  The post covers them.
- Copying photos into evidence storage.
- **The terms-of-use agreement Guideline 1.2 also requires** ("no tolerance
  for objectionable content", accepted before posting). That's an app and
  legal change, not API work, but it's needed before the social features
  ship in the App Store. I'm flagging it here so it isn't missed.

## Files

- `prisma/schema.prisma` + migration (enum, table, partial unique indexes, CHECKs);
  `vitest.setup.ts` (`report` mock)
- `server/utils/reports.ts` (+ test): `parseReportInput`, `REPORT_REASONS`
- `server/api/reports/index.post.ts` (+ test)
- `server/middleware/auth.test.ts`: the route requires auth
- `docs/API_CONTRACT_SOCIAL.md` (new "Reporting" section), `CAPABILITY_MAP.md`,
  `tasks/todo.md`
- A short moderator runbook: setting up the Sentry alert, plus SQL to list
  open reports and resolve one. It goes in `docs/social/MODERATION.md`.

## Success criteria

- [ ] Reporting a visible post → `201`, with a snapshot of its body, its photo
      count and whether it shared a workout, and `reportedUserId` set to the
      author.
- [ ] Editing or deleting the post afterwards leaves the snapshot unchanged.
      Deleting it sets `postId` to null and keeps the report.
- [ ] Reporting a user → `201`, with a snapshot of their name and avatar.
- [ ] A post the reporter can't see (private and not followed, or blocked
      either way) → `404`. A user who blocked the reporter → `404`.
      A user the reporter blocked → `201`.
- [ ] Yourself or your own post → `400`. Both targets or neither → `400`. A bad
      reason → `400`. `details` over 1,000 characters → `400`.
- [ ] Reporting the same target again, including concurrently → `200` with the
      first report's id, and no second row.
- [ ] A new report sends exactly one Sentry message and one log line, neither
      containing text or details. A repeat sends none. A Sentry failure still
      returns `201`.
- [ ] More than 20 reports in an hour → `429`.
- [ ] Deleting either account removes the report.
- [ ] Unauthenticated → `401`.
