import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.post'
const mockNotify = notify as ReturnType<typeof vi.fn>
const mockPushAfterCommit = pushAfterCommit as ReturnType<typeof vi.fn>

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockQueryRaw = prisma.$queryRaw as ReturnType<typeof vi.fn>
const mockFindFollow = prisma.follow.findUnique as ReturnType<typeof vi.fn>
const mockCreateFollow = prisma.follow.create as ReturnType<typeof vi.fn>
const mockIsBlocked = isBlockedEitherWay as ReturnType<typeof vi.fn>
const mockRateLimitByKey = rateLimitByKey as ReturnType<typeof vi.fn>
const mockWithPairLock = withPairLock as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string }; node: { res: { statusCode: number } } }

const ME = 'ca'
const THEM = 'cz'
let inLock = false

function makeEvent(): Event {
  return { path: '/api/following', context: { userId: ME }, node: { res: { statusCode: 200 } } }
}
const call = (event: Event) => (handler as unknown as (e: Event) => Promise<unknown>)(event)
const targetIs = (profileVisibility: 'PUBLIC' | 'PRIVATE') => mockQueryRaw.mockResolvedValueOnce([{ profileVisibility }])

describe('POST /api/following', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadBody.mockResolvedValue({ userId: THEM })
    mockIsBlocked.mockResolvedValue(false)
    mockFindFollow.mockResolvedValue(null)
    mockRateLimitByKey.mockResolvedValue(undefined)
    mockWithPairLock.mockImplementation(async (_a: string, _b: string, fn: (tx: unknown) => unknown) => {
      inLock = true
      try { return await fn(prisma) } finally { inLock = false }
    })
  })

  test('following a PUBLIC profile is accepted at once → 201 following', async () => {
    targetIs('PUBLIC')
    mockCreateFollow.mockResolvedValueOnce({ id: 'f1', status: 'ACCEPTED' })
    const event = makeEvent()

    const result = await call(event)

    expect(mockCreateFollow).toHaveBeenCalledWith({
      data: { followerId: ME, followeeId: THEM, status: 'ACCEPTED', acceptedAt: expect.any(Date) },
      select: expect.objectContaining({ id: true, status: true }),
    })
    expect(event.node.res.statusCode).toBe(201)
    expect(result).toEqual({ status: 'following' })
  })

  test('following a PRIVATE profile creates a pending request → 201 requested', async () => {
    targetIs('PRIVATE')
    mockCreateFollow.mockResolvedValueOnce({ id: 'f1', status: 'PENDING' })
    const event = makeEvent()

    const result = await call(event)

    expect(mockCreateFollow.mock.calls[0]![0].data).toEqual({ followerId: ME, followeeId: THEM, status: 'PENDING', acceptedAt: null })
    expect(event.node.res.statusCode).toBe(201)
    expect(result).toEqual({ status: 'requested', requestId: 'f1' })
  })

  test('is idempotent: an existing follow or request responds 200 with its status', async () => {
    targetIs('PRIVATE')
    mockFindFollow.mockResolvedValueOnce({ id: 'f1', status: 'PENDING' })
    const event = makeEvent()

    const result = await call(event)

    expect(mockFindFollow).toHaveBeenCalledWith({
      where: { followerId_followeeId: { followerId: ME, followeeId: THEM } },
      select: expect.objectContaining({ status: true }),
    })
    expect(mockCreateFollow).not.toHaveBeenCalled()
    expect(event.node.res.statusCode).toBe(200)
    expect(result).toEqual({ status: 'requested', requestId: 'f1' })
  })

  // The target's visibility is read FOR SHARE so this serializes with
  // PATCH /api/auth/me (which locks the row FOR UPDATE before deciding to go
  // public): a request can't be left PENDING on a profile that just went PUBLIC.
  test("reads the target's visibility with a row lock", async () => {
    targetIs('PUBLIC')
    mockCreateFollow.mockResolvedValueOnce({ id: 'f1', status: 'ACCEPTED' })

    await call(makeEvent())

    const [strings, ...values] = mockQueryRaw.mock.calls[0]!
    expect((strings as string[]).join('?')).toMatch(/FROM "User".*FOR SHARE/s)
    expect(values).toEqual([THEM])
  })

  // Regression guard carried over from PR #133: the block check and the write
  // run inside the pair lock POST /api/blocks also takes.
  test('checks for a block and writes while holding the pair lock', async () => {
    const calls: string[] = []
    const mark = (label: string) => calls.push(`${label}:${inLock ? 'locked' : 'UNLOCKED'}`)
    mockQueryRaw.mockImplementationOnce(async () => { mark('target'); return [{ profileVisibility: 'PUBLIC' }] })
    mockIsBlocked.mockImplementationOnce(async () => { mark('blockCheck'); return false })
    mockCreateFollow.mockImplementationOnce(async () => { mark('create'); return { id: 'f1', status: 'ACCEPTED' } })

    await call(makeEvent())

    expect(mockWithPairLock).toHaveBeenCalledWith(ME, THEM, expect.any(Function))
    expect(mockIsBlocked).toHaveBeenCalledWith(ME, THEM, prisma)
    expect(calls).toEqual(['target:locked', 'blockCheck:locked', 'create:locked'])
  })

  test('404 when the target does not exist', async () => {
    mockQueryRaw.mockResolvedValueOnce([])
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User not found' })
    expect(mockCreateFollow).not.toHaveBeenCalled()
  })

  test('404 — identical to not-found — when a block exists either way', async () => {
    targetIs('PUBLIC')
    mockIsBlocked.mockResolvedValueOnce(true)

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User not found' })
    expect(mockCreateFollow).not.toHaveBeenCalled()
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

  test('400 when following yourself', async () => {
    mockReadBody.mockResolvedValueOnce({ userId: ME })
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Cannot follow yourself' })
  })

  test('rate-limits per user, 60 per hour, before touching the database', async () => {
    mockRateLimitByKey.mockRejectedValueOnce(Object.assign(new Error('Too many requests'), { statusCode: 429 }))

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 429 })
    expect(mockRateLimitByKey).toHaveBeenCalledWith(`follow:${ME}`, 60, '1 h')
    expect(mockWithPairLock).not.toHaveBeenCalled()
  })

  test('500 with a generic message on an unexpected database error', async () => {
    targetIs('PUBLIC')
    mockCreateFollow.mockRejectedValueOnce(new Error('connection reset'))

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to follow user' })
    expect(logger.error).toHaveBeenCalled()
  })

  describe('notifications', () => {
    test('a PUBLIC follow notifies the followee of a new follower, under the lock, and pushes after commit', async () => {
      targetIs('PUBLIC')
      mockCreateFollow.mockResolvedValueOnce({ id: 'f1', status: 'ACCEPTED' })
      const order: string[] = []
      mockNotify.mockImplementationOnce(async () => { order.push(inLock ? 'notify:locked' : 'notify:UNLOCKED'); return 'new_follower:ca:cz' })
      mockPushAfterCommit.mockImplementationOnce(() => { order.push(inLock ? 'push:UNCOMMITTED' : 'push:after') })
      const event = makeEvent()

      await call(event)

      expect(mockNotify).toHaveBeenCalledWith(prisma, { recipientId: THEM, actorId: ME, type: 'NEW_FOLLOWER', dedupeKey: 'new_follower:ca:cz' })
      expect(mockPushAfterCommit).toHaveBeenCalledWith(event, 'new_follower:ca:cz')
      expect(order).toEqual(['notify:locked', 'push:after'])
    })

    test('a PRIVATE follow sends a follow request that deep-links to the request', async () => {
      targetIs('PRIVATE')
      mockCreateFollow.mockResolvedValueOnce({ id: 'f1', status: 'PENDING' })

      await call(makeEvent())

      expect(mockNotify).toHaveBeenCalledWith(prisma, {
        recipientId: THEM, actorId: ME, type: 'FOLLOW_REQUEST', dedupeKey: 'follow_request:ca:cz', target: { followId: 'f1' },
      })
    })

    test('an existing follow or request notifies nobody', async () => {
      targetIs('PRIVATE')
      mockFindFollow.mockResolvedValueOnce({ id: 'f1', status: 'PENDING' })
      const event = makeEvent()

      await call(event)

      expect(mockNotify).not.toHaveBeenCalled()
      expect(mockPushAfterCommit).toHaveBeenCalledWith(event, null)
    })
  })
})
