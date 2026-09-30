import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.get'

const mockFindMany = prisma.friendship.findMany as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }

const ME = 'cm'
const me = { id: ME, name: 'Me', avatarUrl: null }
const zoe = { id: 'ca', name: 'zoe', avatarUrl: null }
const bob = { id: 'cz', name: 'Bob', avatarUrl: 'https://img/b.png' }
const nameless = { id: 'cb', name: null, avatarUrl: null }
const t1 = new Date('2026-09-01T12:00:00.000Z')
const t2 = new Date('2026-09-02T12:00:00.000Z')
const t3 = new Date('2026-09-03T12:00:00.000Z')

const call = () => (handler as unknown as (e: Event) => Promise<unknown>)({ path: '/api/friends', context: { userId: ME } })

describe('GET /api/friends', () => {
  beforeEach(() => vi.clearAllMocks())

  test('lists accepted friends from either side of the pair, by name (case-insensitive, nameless last)', async () => {
    mockFindMany.mockResolvedValueOnce([
      { acceptedAt: t1, userLow: zoe, userHigh: me },
      { acceptedAt: t2, userLow: me, userHigh: bob },
      { acceptedAt: t3, userLow: nameless, userHigh: me },
    ])

    const result = await call()

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { status: 'ACCEPTED', OR: [{ userLowId: ME }, { userHighId: ME }] },
      select: {
        acceptedAt: true,
        userLow: { select: { id: true, name: true, avatarUrl: true } },
        userHigh: { select: { id: true, name: true, avatarUrl: true } },
      },
    })
    expect(result).toEqual({
      friends: [
        { ...bob, friendsSince: t2 },
        { ...zoe, friendsSince: t1 },
        { ...nameless, friendsSince: t3 },
      ],
    })
  })

  test('returns an empty list when the caller has no friends', async () => {
    mockFindMany.mockResolvedValueOnce([])
    expect(await call()).toEqual({ friends: [] })
  })

  test('500 with a generic message on a database error', async () => {
    mockFindMany.mockRejectedValueOnce(new Error('timeout'))
    await expect(call()).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch friends' })
    expect(logger.error).toHaveBeenCalled()
  })
})
