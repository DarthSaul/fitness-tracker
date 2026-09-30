import { describe, test, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

import handler from './index.post'

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockFindUser = prisma.user.findUnique as ReturnType<typeof vi.fn>
const mockFindBlock = prisma.userBlock.findUnique as ReturnType<typeof vi.fn>
const mockCreateBlock = prisma.userBlock.create as ReturnType<typeof vi.fn>
const mockDeleteFriendships = prisma.friendship.deleteMany as ReturnType<typeof vi.fn>
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>

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
    mockDeleteFriendships.mockResolvedValue({ count: 0 })
    mockTransaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops))
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

  test('severs any friendship or pending request between the pair in the same transaction', async () => {
    mockCreateBlock.mockResolvedValueOnce({ blockedId: 'bob', createdAt: blockedAt })

    await call(makeEvent())

    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(mockTransaction.mock.calls[0]![0]).toHaveLength(2)
    // 'alice' < 'bob', so alice is the low id; no status filter — pending and accepted both go.
    expect(mockDeleteFriendships).toHaveBeenCalledWith({ where: { userLowId: 'alice', userHighId: 'bob' } })
  })

  test('an existing block does not re-run the transaction', async () => {
    mockFindBlock.mockResolvedValueOnce({ blockedId: 'bob', createdAt: blockedAt })

    await call(makeEvent())

    expect(mockTransaction).not.toHaveBeenCalled()
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

  test('a concurrent duplicate (P2002) resolves to the existing block with 200', async () => {
    mockCreateBlock.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    )
    mockFindBlock.mockResolvedValueOnce(null).mockResolvedValueOnce({ blockedId: 'bob', createdAt: blockedAt })
    const event = makeEvent()

    const result = await call(event)

    expect(event.node.res.statusCode).toBe(200)
    expect(result).toEqual({ userId: 'bob', blockedAt })
  })

  test.each([
    ['missing body', undefined],
    ['missing userId', {}],
    ['non-string userId', { userId: 42 }],
    ['blank userId', { userId: '   ' }],
  ])('400 on %s', async (_label, body) => {
    mockReadBody.mockResolvedValueOnce(body)
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 400 })
    expect(mockCreateBlock).not.toHaveBeenCalled()
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
})
