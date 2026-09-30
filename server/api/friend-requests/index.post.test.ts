import { describe, test, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

import handler from './index.post'

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockFindUser = prisma.user.findUnique as ReturnType<typeof vi.fn>
const mockFindFriendship = prisma.friendship.findUnique as ReturnType<typeof vi.fn>
const mockCreateFriendship = prisma.friendship.create as ReturnType<typeof vi.fn>
const mockUpdateFriendship = prisma.friendship.update as ReturnType<typeof vi.fn>
const mockIsBlocked = isBlockedEitherWay as ReturnType<typeof vi.fn>
const mockRateLimitByKey = rateLimitByKey as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string }; node: { res: { statusCode: number } } }

// 'ca' < 'cb', so alice is always userLow and bob userHigh.
const ALICE = 'ca'
const BOB = 'cb'
const bob = { id: BOB, name: 'Bob', avatarUrl: null }
const createdAt = new Date('2026-09-29T12:00:00.000Z')
const acceptedAt = new Date('2026-09-29T13:00:00.000Z')
const pairKey = { userLowId_userHighId: { userLowId: ALICE, userHighId: BOB } }
const friendshipSelect = { id: true, requesterId: true, status: true, createdAt: true, acceptedAt: true }

function makeEvent(): Event {
  return { path: '/api/friend-requests', context: { userId: ALICE }, node: { res: { statusCode: 200 } } }
}
const call = (event: Event) => (handler as unknown as (e: Event) => Promise<unknown>)(event)
const p2002 = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })

describe('POST /api/friend-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadBody.mockResolvedValue({ userId: BOB })
    mockFindUser.mockResolvedValue(bob)
    mockIsBlocked.mockResolvedValue(false)
    mockFindFriendship.mockResolvedValue(null)
    mockRateLimitByKey.mockResolvedValue(undefined)
  })

  test('creates a PENDING request with the sorted pair and responds 201', async () => {
    mockCreateFriendship.mockResolvedValueOnce({ id: 'f1', requesterId: ALICE, status: 'PENDING', createdAt, acceptedAt: null })
    const event = makeEvent()

    const result = await call(event)

    expect(mockCreateFriendship).toHaveBeenCalledWith({
      data: { userLowId: ALICE, userHighId: BOB, requesterId: ALICE },
      select: friendshipSelect,
    })
    expect(event.node.res.statusCode).toBe(201)
    expect(result).toEqual({ id: 'f1', user: bob, direction: 'outgoing', createdAt })
  })

  test('sorts the pair when the requester has the higher id', async () => {
    const event = { ...makeEvent(), context: { userId: 'cz' } }
    mockCreateFriendship.mockResolvedValueOnce({ id: 'f1', requesterId: 'cz', status: 'PENDING', createdAt, acceptedAt: null })

    await call(event)

    expect(mockCreateFriendship.mock.calls[0]![0].data).toEqual({ userLowId: BOB, userHighId: 'cz', requesterId: 'cz' })
  })

  test('is idempotent: my existing pending request responds 200 without writing', async () => {
    mockFindFriendship.mockResolvedValueOnce({ id: 'f1', requesterId: ALICE, status: 'PENDING', createdAt, acceptedAt: null })
    const event = makeEvent()

    const result = await call(event)

    expect(mockFindFriendship).toHaveBeenCalledWith({ where: pairKey, select: friendshipSelect })
    expect(mockCreateFriendship).not.toHaveBeenCalled()
    expect(mockUpdateFriendship).not.toHaveBeenCalled()
    expect(event.node.res.statusCode).toBe(200)
    expect(result).toEqual({ id: 'f1', user: bob, direction: 'outgoing', createdAt })
  })

  test('a crossed request (they already asked me) accepts theirs and responds 200 with the friend', async () => {
    mockFindFriendship.mockResolvedValueOnce({ id: 'f1', requesterId: BOB, status: 'PENDING', createdAt, acceptedAt: null })
    mockUpdateFriendship.mockResolvedValueOnce({ id: 'f1', requesterId: BOB, status: 'ACCEPTED', createdAt, acceptedAt })
    const event = makeEvent()

    const result = await call(event)

    expect(mockUpdateFriendship).toHaveBeenCalledWith({
      where: { id: 'f1', status: 'PENDING' },
      data: { status: 'ACCEPTED', acceptedAt: expect.any(Date) },
      select: friendshipSelect,
    })
    expect(mockCreateFriendship).not.toHaveBeenCalled()
    expect(event.node.res.statusCode).toBe(200)
    expect(result).toEqual({ friend: { ...bob, friendsSince: acceptedAt } })
  })

  test('409 when already friends', async () => {
    mockFindFriendship.mockResolvedValueOnce({ id: 'f1', requesterId: BOB, status: 'ACCEPTED', createdAt, acceptedAt })

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Already friends' })
    expect(mockCreateFriendship).not.toHaveBeenCalled()
  })

  test('a concurrent duplicate (P2002) re-reads the pair and applies the same rules', async () => {
    mockCreateFriendship.mockRejectedValueOnce(p2002())
    mockFindFriendship
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'f1', requesterId: ALICE, status: 'PENDING', createdAt, acceptedAt: null })
    const event = makeEvent()

    const result = await call(event)

    expect(mockCreateFriendship).toHaveBeenCalledTimes(1)
    expect(event.node.res.statusCode).toBe(200)
    expect(result).toEqual({ id: 'f1', user: bob, direction: 'outgoing', createdAt })
  })

  test('a crossed request withdrawn mid-accept (P2025) re-reads and sends a fresh request', async () => {
    mockFindFriendship
      .mockResolvedValueOnce({ id: 'f1', requesterId: BOB, status: 'PENDING', createdAt, acceptedAt: null })
      .mockResolvedValueOnce(null)
    mockUpdateFriendship.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'test' }),
    )
    mockCreateFriendship.mockResolvedValueOnce({ id: 'f2', requesterId: ALICE, status: 'PENDING', createdAt, acceptedAt: null })
    const event = makeEvent()

    const result = await call(event)

    expect(event.node.res.statusCode).toBe(201)
    expect(result).toMatchObject({ id: 'f2', direction: 'outgoing' })
  })

  test('500 if the pair changes under us twice in a row', async () => {
    mockCreateFriendship.mockRejectedValueOnce(p2002()).mockRejectedValueOnce(p2002())

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 500 })
    expect(mockCreateFriendship).toHaveBeenCalledTimes(2)
  })

  test('404 when the target does not exist', async () => {
    mockFindUser.mockResolvedValueOnce(null)
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User not found' })
    expect(mockCreateFriendship).not.toHaveBeenCalled()
  })

  test('404 — identical to not-found — when a block exists either way', async () => {
    mockIsBlocked.mockResolvedValueOnce(true)

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User not found' })
    expect(mockIsBlocked).toHaveBeenCalledWith(ALICE, BOB)
    expect(mockFindFriendship).not.toHaveBeenCalled()
  })

  test.each([
    ['missing body', undefined],
    ['missing userId', {}],
    ['non-string userId', { userId: 7 }],
    ['blank userId', { userId: ' ' }],
  ])('400 on %s', async (_label, body) => {
    mockReadBody.mockResolvedValueOnce(body)
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 400 })
  })

  test('400 when requesting yourself', async () => {
    mockReadBody.mockResolvedValueOnce({ userId: ALICE })
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Cannot friend yourself' })
  })

  test('rate-limits per user, 30 per hour, before touching the database', async () => {
    mockRateLimitByKey.mockRejectedValueOnce(Object.assign(new Error('Too many requests'), { statusCode: 429 }))

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 429 })
    expect(mockRateLimitByKey).toHaveBeenCalledWith(`friend-request:${ALICE}`, 30, '1 h')
    expect(mockFindUser).not.toHaveBeenCalled()
  })

  test('500 with a generic message on an unexpected database error', async () => {
    mockCreateFriendship.mockRejectedValueOnce(new Error('connection reset'))

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to send friend request' })
    expect(logger.error).toHaveBeenCalled()
  })
})
