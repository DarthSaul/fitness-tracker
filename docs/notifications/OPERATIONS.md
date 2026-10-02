# Notifications: operations

The runbook for the scheduled sweep. For the design, see
[SPEC-notifications.md](SPEC-notifications.md) §6.

## How it runs

Every 5 minutes, Supabase `pg_cron` calls `POST /api/internal/notifications/sweep`.
- **Auth:** the call carries `Authorization: Bearer <secret>`. The route compares
  it with `NUXT_NOTIFICATIONS_CRON_SECRET` in constant time.
- **The secret lives in two places, and both must match:**
  - Supabase Vault, as `notifications_cron_secret`
  - Vercel, as `NUXT_NOTIFICATIONS_CRON_SECRET` (production only)
- **The target URL** is the Vault secret `notifications_sweep_url`, so the job
  SQL holds no environment-specific values.

This setup lives here, not in a Prisma migration. `pg_cron`, `pg_net` and Vault
exist only on Supabase, so a migration using them would fail on any shadow or
local Postgres that replays the migration history.

| Piece | State |
|---|---|
| Vault `notifications_cron_secret`, `notifications_sweep_url` | Set 2026-10-02 |
| Vercel `NUXT_NOTIFICATIONS_CRON_SECRET` (production) | Set 2026-10-02. Takes effect on the next production deploy. |
| Extensions `pg_cron`, `pg_net` | Enable when scheduling (step 1 below) |
| Cron job `notifications-sweep` | Schedule only **after** the sweep route is live in production (step 2) |

## 1. Enable the extensions (once)

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

## 2. Schedule the job

Do this only once the route is deployed. Before that, every call is a 404.

First check the route is live. Without the secret it must answer `401`, not
`404`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://drdumbbell.app/api/internal/notifications/sweep
```

Then schedule:

```sql
SELECT cron.schedule(
  'notifications-sweep',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notifications_sweep_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notifications_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
```

`cron.schedule` with an existing job name updates that job in place, so
re-running this is safe.

## Checking it

`pg_net` is asynchronous. The cron run succeeds as soon as the request is
queued, so look at the HTTP response as well:

```sql
-- Did the job fire?
SELECT start_time, status, return_message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'notifications-sweep')
ORDER BY start_time DESC LIMIT 5;

-- What did the route answer? (pg_net keeps responses for about 6 hours)
SELECT created, status_code, left(content, 200) AS body
FROM net._http_response ORDER BY created DESC LIMIT 5;
```

| Status | Meaning | Fix |
|---|---|---|
| `200` | Healthy. The body is the summary: `{ unfinished, reminders, retried, pushes, purged, … }`. | — |
| `401` | The Vault and Vercel secrets differ, **or** `NUXT_NOTIFICATIONS_CRON_SECRET` isn't set in the running deployment. The response is deliberately the same in both cases, so a stranger can't tell them apart. | Search Vercel logs for `NUXT_NOTIFICATIONS_CRON_SECRET is not set`. If you find it, set the variable and redeploy. Otherwise rotate both (below). |
| `429` | Rate-limited per IP. pg_cron's 12 calls an hour never trip it. | Look for something else calling the route. |
| `500` | A step failed. The others still ran. | The message names the step. Look for `[notifications.sweep] Step failed` in Vercel logs and in Sentry. |
| `404` | The route isn't deployed. | Deploy it, or unschedule the job until it is. |

Each run also logs one `notifications.sweep` line with the same counts. If that
line hasn't appeared for 30 minutes, the scheduler has stopped.

## Rotating the secret

1. Generate a new secret: `openssl rand -hex 32`.
2. Store it in Vault:
   `SELECT vault.update_secret((SELECT id FROM vault.secrets WHERE name = 'notifications_cron_secret'), '<new>');`
3. Set `NUXT_NOTIFICATIONS_CRON_SECRET` on Vercel (production) to the same
   value, then redeploy production.

Between steps 2 and 3, sweeps answer `401`. That's harmless: every step is
idempotent, and the next run catches up.

## Pausing or removing it

```sql
SELECT cron.unschedule('notifications-sweep');
```

Notifications that routes write directly (follows, reactions) and their
immediate pushes don't depend on the sweep. Pausing it stops:
- workout reminders
- unfinished-workout reminders
- push retries
- retention purges
