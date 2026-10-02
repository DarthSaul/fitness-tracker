import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './sweep.post'

const mockGetHeader = getHeader as ReturnType<typeof vi.fn>
const mockUseRuntimeConfig = useRuntimeConfig as ReturnType<typeof vi.fn>
const mockIsAuthorized = isAuthorizedCronRequest as ReturnType<typeof vi.fn>
const mockRunSweep = runNotificationSweep as ReturnType<typeof vi.fn>

type Event = { path: string; context: Record<string, unknown> }
const call = () => (handler as unknown as (e: Event) => Promise<unknown>)({ path: '/api/internal/notifications/sweep', context: {} })

const summary = {
  unfinished: 1, reminders: 0, staleDismissed: 0, retried: 0,
  pushes: { sent: 1, no_device: 0, failed: 0, skipped: 0 }, purged: 0, failedSteps: [], durationMs: 12,
}

describe('POST /api/internal/notifications/sweep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseRuntimeConfig.mockReturnValue({ notificationsCronSecret: 's3cret' })
    mockGetHeader.mockReturnValue('Bearer s3cret')
    mockIsAuthorized.mockReturnValue(true)
    mockRunSweep.mockResolvedValue(summary)
  })

  test('runs the sweep for a caller holding the secret and returns its summary', async () => {
    await expect(call()).resolves.toEqual(summary)
    expect(mockIsAuthorized).toHaveBeenCalledWith('Bearer s3cret', 's3cret')
    expect(mockRunSweep).toHaveBeenCalledOnce()
  })

  test('401 without the secret, and the sweep does not run', async () => {
    mockIsAuthorized.mockReturnValueOnce(false)
    await expect(call()).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Unauthorized' })
    expect(mockRunSweep).not.toHaveBeenCalled()
  })

  // An unconfigured deploy answers like a wrong secret, so a stranger can't
  // learn whether the secret is set, and scanners don't create 5xx in Sentry.
  // The error log line is how an operator tells the two apart.
  test('401 when the secret is not configured, with an error log for operators', async () => {
    mockUseRuntimeConfig.mockReturnValue({ notificationsCronSecret: '' })
    await expect(call()).rejects.toMatchObject({ statusCode: 401, statusMessage: 'Unauthorized' })
    expect(logger.error).toHaveBeenCalledWith(
      { route: 'POST /api/internal/notifications/sweep' },
      '[notifications.sweep] NUXT_NOTIFICATIONS_CRON_SECRET is not set',
    )
    expect(mockRunSweep).not.toHaveBeenCalled()
  })

  test('rate-limits by IP before anything else (it is reachable without a user session)', async () => {
    const mockRateLimit = rateLimitByIp as ReturnType<typeof vi.fn>
    mockRateLimit.mockRejectedValueOnce(Object.assign(new Error('Too Many Requests'), { statusCode: 429 }))
    await expect(call()).rejects.toMatchObject({ statusCode: 429 })
    expect(mockIsAuthorized).not.toHaveBeenCalled()
    expect(mockRunSweep).not.toHaveBeenCalled()
  })

  test('500 when a step failed, so Sentry sees it; the other steps already ran', async () => {
    mockRunSweep.mockResolvedValueOnce({ ...summary, failedSteps: ['reminders'] })
    await expect(call()).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Notification sweep failed: reminders' })
  })
})
