import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './unread-count.get'

const mockUnreadCount = unreadCount as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }
const call = () => (handler as unknown as (e: Event) => Promise<unknown>)({ path: '/api/notifications/unread-count', context: { userId: 'me' } })

describe('GET /api/notifications/unread-count', () => {
  beforeEach(() => vi.clearAllMocks())

  test('returns the badge count for the caller', async () => {
    mockUnreadCount.mockResolvedValueOnce(7)
    await expect(call()).resolves.toEqual({ count: 7 })
    expect(mockUnreadCount).toHaveBeenCalledWith('me')
  })

  test('500 with a generic message on a database error', async () => {
    mockUnreadCount.mockRejectedValueOnce(new Error('timeout'))
    await expect(call()).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to count notifications' })
    expect(logger.error).toHaveBeenCalled()
  })
})
