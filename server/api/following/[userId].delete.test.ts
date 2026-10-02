import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[userId].delete'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockDeleteMany = prisma.follow.deleteMany as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string }; node: { res: { statusCode: number } } }

function makeEvent(): Event {
  return { path: '/api/following/cz', context: { userId: 'ca' }, node: { res: { statusCode: 200 } } }
}
const call = (event: Event) => (handler as unknown as (e: Event) => Promise<null>)(event)

describe('DELETE /api/following/:userId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRouterParam.mockReturnValue('cz')
    mockDeleteMany.mockResolvedValue({ count: 1 })

    ;(prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma))
  })

  test('removes my follow of them — accepted or pending, so it also cancels a request → 204', async () => {
    const event = makeEvent()

    const result = await call(event)

    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { followerId: 'ca', followeeId: 'cz' } })
    expect(event.node.res.statusCode).toBe(204)
    expect(result).toBeNull()
  })

  test('is idempotent: 204 when not following', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 0 })
    const event = makeEvent()

    await call(event)

    expect(event.node.res.statusCode).toBe(204)
  })

  test('400 when the userId param is missing', async () => {
    mockGetRouterParam.mockReturnValue(undefined)
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 400 })
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })

  test('500 with a generic message on a database error', async () => {
    mockDeleteMany.mockRejectedValueOnce(new Error('timeout'))
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to unfollow user' })
    expect(logger.error).toHaveBeenCalled()
  })

  describe('notifications', () => {
    test('cancelling a request retracts its notification, in the same transaction', async () => {
      await call(makeEvent())
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
      expect(retract).toHaveBeenCalledWith(prisma, { dedupeKey: 'follow_request:ca:cz' })
    })

    test('not following: nothing retracted', async () => {
      mockDeleteMany.mockResolvedValueOnce({ count: 0 })
      await call(makeEvent())
      expect(retract).not.toHaveBeenCalled()
    })
  })
})
