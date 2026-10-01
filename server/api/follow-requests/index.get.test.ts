import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.get'

const mockGetQuery = getQuery as ReturnType<typeof vi.fn>
const mockFindMany = prisma.follow.findMany as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }

const pub = { select: { id: true, name: true, avatarUrl: true, profileVisibility: true } }
const ann = { id: 'ann', name: 'Ann', avatarUrl: null, profileVisibility: 'PUBLIC' }
const t1 = new Date('2026-09-30T12:00:00.000Z')

function call(query: Record<string, unknown> = {}) {
  mockGetQuery.mockReturnValue(query)
  return (handler as unknown as (e: Event) => Promise<unknown>)({ path: '/api/follow-requests', context: { userId: 'me' } })
}

describe('GET /api/follow-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindMany.mockResolvedValue([])
  })

  test('defaults to incoming: pending requests to me, with the requester, newest first', async () => {
    mockFindMany.mockResolvedValueOnce([{ id: 'r1', createdAt: t1, follower: ann }])

    const result = await call()

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { followeeId: 'me', status: 'PENDING' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, createdAt: true, follower: pub },
    })
    expect(result).toEqual({ requests: [{ id: 'r1', user: ann, direction: 'incoming', createdAt: t1 }] })
  })

  test('outgoing: pending requests I sent, with the user I asked', async () => {
    mockFindMany.mockResolvedValueOnce([{ id: 'r2', createdAt: t1, followee: ann }])

    const result = await call({ direction: 'outgoing' })

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { followerId: 'me', status: 'PENDING' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, createdAt: true, followee: pub },
    })
    expect(result).toEqual({ requests: [{ id: 'r2', user: ann, direction: 'outgoing', createdAt: t1 }] })
  })

  test.each([['sideways'], [['incoming']], [3]])('400 on direction=%s', async (direction) => {
    await expect(call({ direction })).rejects.toMatchObject({ statusCode: 400 })
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  test('500 with a generic message on a database error', async () => {
    mockFindMany.mockRejectedValueOnce(new Error('timeout'))
    await expect(call()).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch follow requests' })
    expect(logger.error).toHaveBeenCalled()
  })
})
