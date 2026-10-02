import { describe, test, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

import handler from './accept.post'
const mockNotify = notify as ReturnType<typeof vi.fn>
const mockPushAfterCommit = pushAfterCommit as ReturnType<typeof vi.fn>

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockFindUnique = prisma.follow.findUnique as ReturnType<typeof vi.fn>
const mockUpdate = prisma.follow.update as ReturnType<typeof vi.fn>
const mockWithPairLock = withPairLock as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }

const ann = { id: 'ann', name: 'Ann', avatarUrl: null, profileVisibility: 'PUBLIC' }
const acceptedAt = new Date('2026-09-30T13:00:00.000Z')
const pendingFromAnn = { followerId: 'ann', followeeId: 'me', status: 'PENDING', follower: ann }
let inLock = false

function call(userId = 'me') {
  mockGetRouterParam.mockReturnValue('r1')
  return (handler as unknown as (e: Event) => Promise<unknown>)({ path: '/api/follow-requests/r1/accept', context: { userId } })
}

describe('POST /api/follow-requests/:id/accept', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUnique.mockResolvedValue(pendingFromAnn)
    mockUpdate.mockResolvedValue({ acceptedAt })
    mockWithPairLock.mockImplementation(async (_a: string, _b: string, fn: (tx: unknown) => unknown) => {
      inLock = true
      try { return await fn(prisma) } finally { inLock = false }
    })
  })

  test('the followee accepts: the request becomes a follow, under the pair lock, guarded on PENDING', async () => {
    const calls: string[] = []
    mockUpdate.mockImplementationOnce(async () => { calls.push(inLock ? 'locked' : 'UNLOCKED'); return { acceptedAt } })

    const result = await call()

    expect(mockWithPairLock).toHaveBeenCalledWith('ann', 'me', expect.any(Function))
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'r1', status: 'PENDING' },
      data: { status: 'ACCEPTED', acceptedAt: expect.any(Date) },
      select: { acceptedAt: true },
    })
    expect(calls).toEqual(['locked'])
    expect(result).toEqual({ follower: { ...ann, since: acceptedAt } })
  })

  test.each([
    ['the requester tries to accept their own request', 'ann', pendingFromAnn],
    ['a third user tries to accept it', 'cy', pendingFromAnn],
    ['it is already accepted', 'me', { ...pendingFromAnn, status: 'ACCEPTED' }],
    ['it does not exist', 'me', null],
  ])('404 when %s', async (_label, userId, row) => {
    mockFindUnique.mockResolvedValueOnce(row)

    await expect(call(userId)).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Follow request not found' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test('404 when it was cancelled between the read and the write (P2025)', async () => {
    mockUpdate.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'test' }))
    await expect(call()).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Follow request not found' })
  })

  test('400 when the id param is missing', async () => {
    mockGetRouterParam.mockReturnValue(undefined)
    await expect(
      (handler as unknown as (e: Event) => Promise<unknown>)({ path: '/api/follow-requests//accept', context: { userId: 'me' } }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  test('500 with a generic message on a database error', async () => {
    mockFindUnique.mockRejectedValueOnce(new Error('timeout'))
    await expect(call()).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to accept follow request' })
    expect(logger.error).toHaveBeenCalled()
  })

  describe('notifications', () => {
    test('retracts the request notification and tells the requester, under the lock; pushes after commit', async () => {
      const order: string[] = []
      ;(retract as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => { order.push(inLock ? 'retract:locked' : 'retract:UNLOCKED') })
      mockNotify.mockImplementationOnce(async () => { order.push(inLock ? 'notify:locked' : 'notify:UNLOCKED'); return 'follow_accepted:r1' })
      mockPushAfterCommit.mockImplementationOnce(() => { order.push(inLock ? 'push:UNCOMMITTED' : 'push:after') })

      await call()

      expect(retract).toHaveBeenCalledWith(prisma, { followId: 'r1' })
      expect(mockNotify).toHaveBeenCalledWith(prisma, { recipientId: 'ann', actorId: 'me', type: 'FOLLOW_ACCEPTED', dedupeKey: 'follow_accepted:r1' })
      expect(mockPushAfterCommit).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/follow-requests/r1/accept' }), 'follow_accepted:r1')
      expect(order).toEqual(['retract:locked', 'notify:locked', 'push:after'])
    })

    test('nothing is sent when the request is not found', async () => {
      mockFindUnique.mockResolvedValueOnce(null)
      await expect(call()).rejects.toMatchObject({ statusCode: 404 })
      expect(mockNotify).not.toHaveBeenCalled()
      expect(mockPushAfterCommit).not.toHaveBeenCalled()
    })
  })
})
