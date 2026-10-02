import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './preferences.get'

const mockUserFind = prisma.user.findUnique as ReturnType<typeof vi.fn>
const mockPrefFind = prisma.notificationPreference.findMany as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }
const call = () => (handler as unknown as (e: Event) => Promise<unknown>)({ path: '/api/notifications/preferences', context: { userId: 'me' } })

describe('GET /api/notifications/preferences', () => {
  beforeEach(() => vi.clearAllMocks())

  test('returns every type with defaults filled in', async () => {
    mockUserFind.mockResolvedValueOnce({ timezone: null, workoutReminderMinute: 480 })
    mockPrefFind.mockResolvedValueOnce([{ type: 'NEW_FOLLOWER', pushEnabled: false }])

    const result = await call() as { push: Record<string, boolean>; timezone: string | null; workoutReminderTime: string }

    expect(result.timezone).toBeNull()
    expect(result.workoutReminderTime).toBe('08:00')
    expect(result.push.NEW_FOLLOWER).toBe(false)
    expect(result.push.FOLLOW_REQUEST).toBe(true)
    expect(Object.keys(result.push)).toHaveLength(6)
  })

  test('500 with a generic message on a database error', async () => {
    mockUserFind.mockRejectedValueOnce(new Error('timeout'))
    mockPrefFind.mockResolvedValueOnce([])
    await expect(call()).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch notification preferences' })
    expect(logger.error).toHaveBeenCalled()
  })
})
