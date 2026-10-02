# Moderation runbook

How reports reach a moderator and how to act on them. Background: [SPEC-reports.md](SPEC-reports.md).
There is no moderation UI yet; everything here happens in Sentry and the
Supabase SQL editor.

**Why it matters:** App Store Guideline 1.2 expects objectionable content to be
acted on promptly, within 24 hours. A report nobody sees doesn't meet that.

## 1. Get alerted (one-time setup)

Each new report sends a Sentry message, `social.report`, at level `warning`.
Each report has its own fingerprint, so **every report is a new Sentry issue**.
The alert carries only these tags, never the reported text or the details:
- `report.id`
- `report.target` (`post` or `user`)
- `report.reason`

To get an email for each report, in Sentry:

1. **Alerts → Create Alert → Issues.**
2. **Environment:** `production`.
3. **When:** "A new issue is created".
4. **If:** "The event's message value equals `social.report`". This keeps the
   rule from firing on ordinary errors.
5. **Then:** send a notification by email to you, or to whoever moderates.
6. Name it "Social report" and save.

The menu labels above may differ slightly between Sentry versions; the
conditions are what matter. To test the rule, report something from a test
account and check that the email arrives.

Each report is also logged as a `social.report` line in the Vercel logs, with
`reportId`, `target` and `reason`.

## 2. Review

Open reports, oldest first, newest-alerted last. This query uses the
`(resolvedAt, createdAt)` index:

```sql
select r.id, r."createdAt", r.reason, r.details,
       case when r."isPostReport" then 'post' else 'user' end as target,
       r."postId",            -- null if the post has since been deleted
       u.name as reported_user, r."reportedUserId",
       r.snapshot             -- what was reported, as it was then
from "Report" r
join "User" u on u.id = r."reportedUserId"
where r."resolvedAt" is null
order by r."createdAt";
```

One report, starting from the `report.id` in the alert:

```sql
select * from "Report" where id = '<report id>';
```

Everything reported about one person, to spot a pattern:

```sql
select id, "createdAt", reason, "isPostReport", "resolvedAt", resolution
from "Report" where "reportedUserId" = '<user id>' order by "createdAt" desc;
```

## 3. Act

- **Remove a post.** Deleting a post by SQL deletes its row, its reactions and
  its photo rows. It does **not** delete the photo files in Storage; only the
  API route does that. So:
  1. Note the photo paths:
     `select "storagePath" from "PostPhoto" where "postId" = '<post id>';`
  2. Run `delete from "Post" where id = '<post id>';`. Reports of the post
     keep their snapshot, and their `postId` becomes null.
  3. Delete those files from the private `post-photos` bucket in the Supabase
     dashboard (Storage → `post-photos`).
- **Remove an account.** Don't delete a `User` row by SQL. That skips deleting
  the Supabase Auth user and their Storage files, which
  `DELETE /api/auth/me` handles. There's no admin route for removing someone
  else's account yet. If you need one, it's a small follow-up.
- **Nothing to do.** Just resolve the report (below).

## 4. Resolve

```sql
update "Report"
set "resolvedAt" = now(), resolution = 'Removed post: spam'   -- or 'No action: not a violation'
where id = '<report id>';
```

Then resolve the matching Sentry issue, so open issues mirror open reports.

**Retention:** a report is deleted automatically when the reporter's account
or the reported user's account is deleted. Deleting only the post keeps the
report and its snapshot.
