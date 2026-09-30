import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[userId].delete'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockDeleteMany = prisma.friendship.deleteMany as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string }; node: { res: { statusCode: number } } }

function makeEvent(userId = 'cm'): Event {
  return { path: '/api/friends/x', context: { userId }, node: { res: { statusCode: 200 } } }
}
const call = (event: Event) => (handler as unknown as (e: Event) => Promise<null>)(event)

describe('DELETE /api/friends/:userId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDeleteMany.mockResolvedValue({ count: 1 })
  })

  test.each([
    ['the caller is the low id', 'ca', 'cz'],
    ['the caller is the high id', 'cz', 'ca'],
  ])('deletes only the ACCEPTED row for the sorted pair when %s → 204', async (_label, me, friend) => {
    mockGetRouterParam.mockReturnValue(friend)
    const event = makeEvent(me)

    const result = await call(event)

    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { userLowId: 'ca', userHighId: 'cz', status: 'ACCEPTED' } })
    expect(event.node.res.statusCode).toBe(204)
    expect(result).toBeNull()
  })

  test('is idempotent: 204 when not friends', async () => {
    mockGetRouterParam.mockReturnValue('cz')
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
    mockGetRouterParam.mockReturnValue('cz')
    mockDeleteMany.mockRejectedValueOnce(new Error('timeout'))
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to remove friend' })
    expect(logger.error).toHaveBeenCalled()
  })
})
