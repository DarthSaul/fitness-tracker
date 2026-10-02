import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.get'

const mockGetQuery = getQuery as ReturnType<typeof vi.fn>
const mockFindMany = prisma.notification.findMany as ReturnType<typeof vi.fn>
const mockBlockedIds = blockedUserIds as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }

const t1 = new Date('2026-10-02T12:00:00.000Z')
const ann = { id: 'ann', name: 'Ann', username: 'ann', avatarUrl: null, profileVisibility: 'PUBLIC' }
const row = {
  id: 'n1',
  type: 'FOLLOW_REQUEST',
  createdAt: t1,
  readAt: null,
  dismissedAt: null,
  data: {},
  postId: null,
  followId: 'f1',
  workoutSessionId: null,
  standaloneSessionId: null,
  scheduledWorkoutId: null,
  actor: ann,
}

function call(query: Record<string, unknown> = {}) {
  mockGetQuery.mockReturnValue(query)
  return (handler as unknown as (e: Event) => Promise<unknown>)({ path: '/api/notifications', context: { userId: 'me' } })
}

describe('GET /api/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindMany.mockResolvedValue([])
    mockBlockedIds.mockResolvedValue([])
  })

  test('my non-dismissed notifications, newest first, rendered with status and target', async () => {
    mockFindMany.mockResolvedValueOnce([row])

    const result = await call()

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { AND: [{ recipientId: 'me', dismissedAt: null }, {}] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
      select: notificationSelect,
    })
    expect(result).toEqual({
      notifications: [{
        id: 'n1', type: 'FOLLOW_REQUEST', status: 'unread', createdAt: t1, readAt: null,
        actor: ann, target: { followId: 'f1' }, data: {},
      }],
    })
  })

  test('status=unread adds readAt: null; the cursor and limit page like GET /api/history', async () => {
    await call({ status: 'unread', limit: '5', before: t1.toISOString(), beforeId: 'n9' })

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: [
          { recipientId: 'me', dismissedAt: null, readAt: null },
          { OR: [{ createdAt: { lt: t1 } }, { createdAt: t1, id: { lt: 'n9' } }] },
        ],
      },
      take: 5,
    }))
  })

  test('hides notifications from users blocked either way', async () => {
    mockBlockedIds.mockResolvedValueOnce(['bad'])
    await call()
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ recipientId: 'me', dismissedAt: null, OR: [{ actorId: null }, { actorId: { notIn: ['bad'] } }] }, {}] },
    }))
  })

  test.each([[{ status: 'dismissed' }], [{ status: ['unread'] }], [{ limit: 'ten' }], [{ before: t1.toISOString() }]])('400 on %j', async (query) => {
    await expect(call(query)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  test('500 with a generic message on a database error', async () => {
    mockFindMany.mockRejectedValueOnce(new Error('timeout'))
    await expect(call()).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch notifications' })
    expect(logger.error).toHaveBeenCalled()
  })
})
