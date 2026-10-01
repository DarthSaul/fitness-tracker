import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.get'

const mockFindMany = prisma.follow.findMany as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }

const ann = { id: 'ann', name: 'Ann', avatarUrl: null, profileVisibility: 'PUBLIC' }
const t1 = new Date('2026-09-30T12:00:00.000Z')

const call = () => (handler as unknown as (e: Event) => Promise<unknown>)({ path: '/api/following', context: { userId: 'me' } })

describe('GET /api/following', () => {
  beforeEach(() => vi.clearAllMocks())

  test('lists the users I follow (accepted only), newest first, as public users', async () => {
    mockFindMany.mockResolvedValueOnce([{ acceptedAt: t1, followee: ann }])

    const result = await call()

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { followerId: 'me', status: 'ACCEPTED' },
      orderBy: [{ acceptedAt: 'desc' }, { id: 'desc' }],
      select: { acceptedAt: true, followee: { select: { id: true, name: true, avatarUrl: true, profileVisibility: true } } },
    })
    expect(result).toEqual({ users: [{ ...ann, since: t1 }] })
  })

  test('500 with a generic message on a database error', async () => {
    mockFindMany.mockRejectedValueOnce(new Error('timeout'))
    await expect(call()).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch following' })
    expect(logger.error).toHaveBeenCalled()
  })
})
