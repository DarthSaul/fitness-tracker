import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.post'

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockFindUser = prisma.user.findUnique as ReturnType<typeof vi.fn>
const mockFindFriendship = prisma.friendship.findUnique as ReturnType<typeof vi.fn>
const mockCreateFriendship = prisma.friendship.create as ReturnType<typeof vi.fn>
const mockUpdateFriendship = prisma.friendship.update as ReturnType<typeof vi.fn>
const mockIsBlocked = isBlockedEitherWay as ReturnType<typeof vi.fn>
const mockRateLimitByKey = rateLimitByKey as ReturnType<typeof vi.fn>
const mockWithPairLock = withPairLock as ReturnType<typeof vi.fn>

let inLock = false

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

describe('POST /api/friend-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadBody.mockResolvedValue({ userId: BOB })
    mockFindUser.mockResolvedValue(bob)
    mockIsBlocked.mockResolvedValue(false)
    mockFindFriendship.mockResolvedValue(null)
    mockRateLimitByKey.mockResolvedValue(undefined)
    mockWithPairLock.mockImplementation(async (_a: string, _b: string, fn: (tx: unknown) => unknown) => {
      inLock = true
      try { return await fn(prisma) } finally { inLock = false }
    })
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
      where: { id: 'f1' },
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

  // Regression (PR #133 review): the block check and the write used to run
  // unlocked, so a block created in between left a pending request — which the
  // blocker could then accept — alongside the block. They now run inside the
  // same pair lock POST /api/blocks takes.
  test('checks for a block and writes the request while holding the pair lock', async () => {
    const calls: string[] = []
    const mark = (label: string) => calls.push(`${label}:${inLock ? 'locked' : 'UNLOCKED'}`)
    mockIsBlocked.mockImplementationOnce(async () => { mark('blockCheck'); return false })
    mockFindFriendship.mockImplementationOnce(async () => { mark('read'); return null })
    mockCreateFriendship.mockImplementationOnce(async () => {
      mark('create')
      return { id: 'f1', requesterId: ALICE, status: 'PENDING', createdAt, acceptedAt: null }
    })

    await call(makeEvent())

    expect(mockWithPairLock).toHaveBeenCalledWith(ALICE, BOB, expect.any(Function))
    expect(calls).toEqual(['blockCheck:locked', 'read:locked', 'create:locked'])
  })

  test('a crossed accept also happens under the lock', async () => {
    const calls: string[] = []
    mockFindFriendship.mockResolvedValueOnce({ id: 'f1', requesterId: BOB, status: 'PENDING', createdAt, acceptedAt: null })
    mockUpdateFriendship.mockImplementationOnce(async () => {
      calls.push(inLock ? 'locked' : 'UNLOCKED')
      return { id: 'f1', requesterId: BOB, status: 'ACCEPTED', createdAt, acceptedAt }
    })

    await call(makeEvent())

    expect(calls).toEqual(['locked'])
  })

  test('404 when the target does not exist', async () => {
    mockFindUser.mockResolvedValueOnce(null)
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User not found' })
    expect(mockCreateFriendship).not.toHaveBeenCalled()
  })

  test('404 — identical to not-found — when a block exists either way', async () => {
    mockIsBlocked.mockResolvedValueOnce(true)

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User not found' })
    expect(mockIsBlocked).toHaveBeenCalledWith(ALICE, BOB, prisma)
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
