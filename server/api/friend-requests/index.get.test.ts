import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.get'

const mockGetQuery = getQuery as ReturnType<typeof vi.fn>
const mockFindMany = prisma.friendship.findMany as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }

const ME = 'cm'
const alice = { id: 'ca', name: 'Alice', avatarUrl: null }
const me = { id: ME, name: 'Me', avatarUrl: null }
const zed = { id: 'cz', name: 'Zed', avatarUrl: null }
const t1 = new Date('2026-09-29T12:00:00.000Z')
const t2 = new Date('2026-09-28T12:00:00.000Z')

const include = {
  id: true, requesterId: true, status: true, createdAt: true, acceptedAt: true,
  userLow: { select: { id: true, name: true, avatarUrl: true } },
  userHigh: { select: { id: true, name: true, avatarUrl: true } },
}

function call(query: Record<string, unknown> = {}) {
  mockGetQuery.mockReturnValue(query)
  return (handler as unknown as (e: Event) => Promise<unknown>)({ path: '/api/friend-requests', context: { userId: ME } })
}

describe('GET /api/friend-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindMany.mockResolvedValue([])
  })

  test('defaults to incoming: pending rows I am in but did not send, newest first', async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 'f1', requesterId: 'ca', status: 'PENDING', createdAt: t1, acceptedAt: null, userLow: alice, userHigh: me },
      { id: 'f2', requesterId: 'cz', status: 'PENDING', createdAt: t2, acceptedAt: null, userLow: me, userHigh: zed },
    ])

    const result = await call()

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { status: 'PENDING', requesterId: { not: ME }, OR: [{ userLowId: ME }, { userHighId: ME }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: include,
    })
    expect(result).toEqual({
      requests: [
        { id: 'f1', user: alice, direction: 'incoming', createdAt: t1 },
        { id: 'f2', user: zed, direction: 'incoming', createdAt: t2 },
      ],
    })
  })

  test('outgoing lists the pending requests I sent', async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 'f3', requesterId: ME, status: 'PENDING', createdAt: t1, acceptedAt: null, userLow: me, userHigh: zed },
    ])

    const result = await call({ direction: 'outgoing' })

    expect(mockFindMany.mock.calls[0]![0].where).toEqual({ status: 'PENDING', requesterId: ME })
    expect(result).toEqual({ requests: [{ id: 'f3', user: zed, direction: 'outgoing', createdAt: t1 }] })
  })

  test.each([['sideways'], [['incoming']], [42]])('400 on direction=%s', async (direction) => {
    await expect(call({ direction })).rejects.toMatchObject({ statusCode: 400 })
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  test('500 with a generic message on a database error', async () => {
    mockFindMany.mockRejectedValueOnce(new Error('timeout'))
    await expect(call()).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch friend requests' })
    expect(logger.error).toHaveBeenCalled()
  })
})
