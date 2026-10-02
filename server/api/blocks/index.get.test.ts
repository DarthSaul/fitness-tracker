import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.get'

const mockFindMany = prisma.userBlock.findMany as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }
type Result = { users: { id: string; name: string | null; avatarUrl: string | null; blockedAt: Date }[] }

const call = () =>
  (handler as unknown as (e: Event) => Promise<Result>)({ path: '/api/blocks', context: { userId: 'alice' } })

describe('GET /api/blocks', () => {
  beforeEach(() => vi.clearAllMocks())

  test("lists only the caller's blocks, newest first, as public users", async () => {
    const newer = new Date('2026-09-29T12:00:00.000Z')
    const older = new Date('2026-09-01T12:00:00.000Z')
    mockFindMany.mockResolvedValueOnce([
      { createdAt: newer, blocked: { id: 'bob', name: 'Bob', avatarUrl: null } },
      { createdAt: older, blocked: { id: 'carol', name: null, avatarUrl: 'https://img/c.png' } },
    ])

    const result = await call()

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { blockerId: 'alice' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { createdAt: true, blocked: { select: { id: true, name: true, avatarUrl: true, profileVisibility: true, username: true } } },
    })
    expect(result).toEqual({
      users: [
        { id: 'bob', name: 'Bob', avatarUrl: null, blockedAt: newer },
        { id: 'carol', name: null, avatarUrl: 'https://img/c.png', blockedAt: older },
      ],
    })
  })

  test('returns an empty list when the caller has blocked nobody', async () => {
    mockFindMany.mockResolvedValueOnce([])
    expect(await call()).toEqual({ users: [] })
  })

  test('500 with a generic message on a database error', async () => {
    mockFindMany.mockRejectedValueOnce(new Error('timeout'))
    await expect(call()).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch blocked users' })
    expect(logger.error).toHaveBeenCalled()
  })
})
