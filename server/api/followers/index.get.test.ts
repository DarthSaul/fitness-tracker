import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.get'

const mockFindMany = prisma.follow.findMany as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }

const bo = { id: 'bo', name: 'Bo', avatarUrl: null, profileVisibility: 'PRIVATE' }
const t1 = new Date('2026-09-30T12:00:00.000Z')

const call = () => (handler as unknown as (e: Event) => Promise<unknown>)({ path: '/api/followers', context: { userId: 'me' } })

describe('GET /api/followers', () => {
  beforeEach(() => vi.clearAllMocks())

  test('lists my accepted followers, newest first — never pending requests', async () => {
    mockFindMany.mockResolvedValueOnce([{ acceptedAt: t1, follower: bo }])

    const result = await call()

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { followeeId: 'me', status: 'ACCEPTED' },
      orderBy: [{ acceptedAt: 'desc' }, { id: 'desc' }],
      select: { acceptedAt: true, follower: { select: { id: true, name: true, avatarUrl: true, profileVisibility: true } } },
    })
    expect(result).toEqual({ users: [{ ...bo, since: t1 }] })
  })

  test('500 with a generic message on a database error', async () => {
    mockFindMany.mockRejectedValueOnce(new Error('timeout'))
    await expect(call()).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch followers' })
    expect(logger.error).toHaveBeenCalled()
  })
})
