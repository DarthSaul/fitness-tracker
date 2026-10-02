import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.post'

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockFindUser = prisma.user.findUnique as ReturnType<typeof vi.fn>
const mockFindBlock = prisma.userBlock.findUnique as ReturnType<typeof vi.fn>
const mockCreateBlock = prisma.userBlock.create as ReturnType<typeof vi.fn>
const mockDeleteFollows = prisma.follow.deleteMany as ReturnType<typeof vi.fn>
const mockWithPairLock = withPairLock as ReturnType<typeof vi.fn>

// Tracks whether code is running inside the pair lock, so tests can assert
// that the check and every write happen under it.
let inLock = false
const underLock = (label: string, calls: string[]) => () => { calls.push(`${label}:${inLock ? 'locked' : 'UNLOCKED'}`) }

type Event = { path: string; context: { userId: string }; node: { res: { statusCode: number } } }
type Result = { userId: string; blockedAt: Date }

function makeEvent(): Event {
  return { path: '/api/blocks', context: { userId: 'alice' }, node: { res: { statusCode: 200 } } }
}

const call = (event: Event) => (handler as unknown as (e: Event) => Promise<Result>)(event)
const blockedAt = new Date('2026-09-29T12:00:00.000Z')

describe('POST /api/blocks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadBody.mockResolvedValue({ userId: 'bob' })
    mockFindUser.mockResolvedValue({ id: 'bob' })
    mockFindBlock.mockResolvedValue(null)
    mockDeleteFollows.mockResolvedValue({ count: 0 })
    mockWithPairLock.mockImplementation(async (_a: string, _b: string, fn: (tx: unknown) => unknown) => {
      inLock = true
      try { return await fn(prisma) } finally { inLock = false }
    })
  })

  test('creates a block and responds 201', async () => {
    mockCreateBlock.mockResolvedValueOnce({ blockedId: 'bob', createdAt: blockedAt })
    const event = makeEvent()

    const result = await call(event)

    expect(mockCreateBlock).toHaveBeenCalledWith({
      data: { blockerId: 'alice', blockedId: 'bob' },
      select: { blockedId: true, createdAt: true },
    })
    expect(event.node.res.statusCode).toBe(201)
    expect(result).toEqual({ userId: 'bob', blockedAt })
  })

  test('removes follows and requests in both directions between the pair', async () => {
    mockCreateBlock.mockResolvedValueOnce({ blockedId: 'bob', createdAt: blockedAt })

    await call(makeEvent())

    // No status filter: accepted follows and pending requests both go, both ways.
    expect(mockDeleteFollows).toHaveBeenCalledWith({
      where: {
        OR: [
          { followerId: 'alice', followeeId: 'bob' },
          { followerId: 'bob', followeeId: 'alice' },
        ],
      },
    })
  })

  // Regression (PR #133 review, carried into follows): a follow request that
  // passed its block check could be written after this route's cleanup, leaving
  // a pending request — acceptable by the blocker — alongside the block. Both
  // routes serialize on the same pair lock, so the existence check, the block
  // and the cleanup must all run inside it.
  test('checks, blocks and removes the follows while holding the pair lock', async () => {
    const calls: string[] = []
    mockFindBlock.mockImplementationOnce(async () => { underLock('findBlock', calls)(); return null })
    mockCreateBlock.mockImplementationOnce(async () => { underLock('create', calls)(); return { blockedId: 'bob', createdAt: blockedAt } })
    mockDeleteFollows.mockImplementationOnce(async () => { underLock('deleteFollows', calls)(); return { count: 1 } })

    await call(makeEvent())

    expect(mockWithPairLock).toHaveBeenCalledWith('alice', 'bob', expect.any(Function))
    expect(calls).toEqual(['findBlock:locked', 'create:locked', 'deleteFollows:locked'])
  })

  test('an existing block writes nothing', async () => {
    mockFindBlock.mockResolvedValueOnce({ blockedId: 'bob', createdAt: blockedAt })

    await call(makeEvent())

    expect(mockCreateBlock).not.toHaveBeenCalled()
    expect(mockDeleteFollows).not.toHaveBeenCalled()
  })

  test('takes the blocker from the session, never the body', async () => {
    mockReadBody.mockResolvedValueOnce({ userId: 'bob', blockerId: 'mallory' })
    mockCreateBlock.mockResolvedValueOnce({ blockedId: 'bob', createdAt: blockedAt })

    await call(makeEvent())

    expect(mockCreateBlock.mock.calls[0]![0].data.blockerId).toBe('alice')
  })

  test('is idempotent: an existing block responds 200 without creating', async () => {
    mockFindBlock.mockResolvedValueOnce({ blockedId: 'bob', createdAt: blockedAt })
    const event = makeEvent()

    const result = await call(event)

    expect(mockFindBlock).toHaveBeenCalledWith({
      where: { blockerId_blockedId: { blockerId: 'alice', blockedId: 'bob' } },
      select: { blockedId: true, createdAt: true },
    })
    expect(mockCreateBlock).not.toHaveBeenCalled()
    expect(event.node.res.statusCode).toBe(200)
    expect(result).toEqual({ userId: 'bob', blockedAt })
  })

  test('400 when blocking yourself', async () => {
    mockReadBody.mockResolvedValueOnce({ userId: 'alice' })
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Cannot block yourself' })
  })

  test('404 when the target user does not exist', async () => {
    mockFindUser.mockResolvedValueOnce(null)
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 404 })
    expect(mockCreateBlock).not.toHaveBeenCalled()
  })

  test('500 with a generic message on an unexpected database error', async () => {
    mockCreateBlock.mockRejectedValueOnce(new Error('connection reset'))
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to block user' })
    expect(logger.error).toHaveBeenCalled()
  })

  describe('notifications', () => {
    test('a new block deletes the pair\'s notifications under the lock', async () => {
      mockCreateBlock.mockResolvedValueOnce({ blockedId: 'bob', createdAt: blockedAt })
      const calls: string[] = []
      ;(clearNotificationsBetween as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => underLock('clear', calls)())

      await call(makeEvent())

      expect(clearNotificationsBetween).toHaveBeenCalledWith(prisma, 'alice', 'bob')
      expect(calls).toEqual(['clear:locked'])
    })

    test('an existing block leaves notifications alone (there are none to clear)', async () => {
      mockFindBlock.mockResolvedValueOnce({ blockedId: 'bob', createdAt: blockedAt })
      await call(makeEvent())
      expect(clearNotificationsBetween).not.toHaveBeenCalled()
    })
  })
})
