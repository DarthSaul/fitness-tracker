defineRouteMeta({
  openAPI: {
    tags: ['Internal'],
    summary: 'Run the notifications sweep',
    description:
      'Machine-to-machine only: Supabase pg_cron calls this every 5 minutes with `Authorization: Bearer '
      + '<NUXT_NOTIFICATIONS_CRON_SECRET>`. Queues unfinished-workout and scheduled-workout reminders, retries '
      + 'undelivered pushes and purges old notifications (docs/notifications/SPEC-notifications.md §6). Idempotent.',
    responses: {
      200: { description: 'Sweep summary: counts per step' },
      401: { description: 'Missing or wrong secret (also when none is configured; see the error log)' },
      429: { description: 'Too many requests' },
      500: { description: 'One or more steps failed (the others still ran)' },
    },
  },
})

export default defineEventHandler(async (event): Promise<SweepSummary> => {
  // No user session guards this route, so throttle it like the auth routes.
  // pg_cron calls it 12 times an hour, far below the limit.
  await rateLimitByIp(event)

  const secret = useRuntimeConfig().notificationsCronSecret as string
  if (!secret) {
    // Answered exactly like a wrong secret, so a caller can't tell whether one
    // is configured. This log line is how an operator tells the two apart.
    ;(event.context.logger ?? logger).error({ route: 'POST /api/internal/notifications/sweep' }, '[notifications.sweep] NUXT_NOTIFICATIONS_CRON_SECRET is not set')
  }
  if (!secret || !isAuthorizedCronRequest(getHeader(event, 'authorization'), secret)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const summary = await runNotificationSweep()
  if (summary.failedSteps.length > 0) {
    // 5xx so @sentry/nuxt captures it; the step errors are already in the log.
    throw createError({ statusCode: 500, statusMessage: `Notification sweep failed: ${summary.failedSteps.join(', ')}` })
  }
  return summary
})
