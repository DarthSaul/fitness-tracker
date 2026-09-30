import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].delete'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockDeleteMany = prisma.friendship.deleteMany as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string }; node: { res: { statusCode: number } } }

const ME = 'cm'

function makeEvent(): Event {
  return { path: '/api/friend-requests/f1', context: { userId: ME }, node: { res: { statusCode: 200 } } }
}
const call = (event: Event) => (handler as unknown as (e: Event) => Promise<null>)(event)

describe('DELETE /api/friend-requests/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRouterParam.mockReturnValue('f1')
  })

  test('deletes a pending request the caller is part of (cancel or decline) in one guarded query → 204', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 1 })
    const event = makeEvent()

    const result = await call(event)

    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: 'f1', status: 'PENDING', OR: [{ userLowId: ME }, { userHighId: ME }] },
    })
    expect(event.node.res.statusCode).toBe(204)
    expect(result).toBeNull()
  })

  test('404 when nothing matched — not mine, not pending (a friendship), or gone', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 0 })
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Friend request not found' })
  })

  test('400 when the id param is missing', async () => {
    mockGetRouterParam.mockReturnValue(undefined)
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 400 })
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })

  test('500 with a generic message on a database error', async () => {
    mockDeleteMany.mockRejectedValueOnce(new Error('timeout'))
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to remove friend request' })
    expect(logger.error).toHaveBeenCalled()
  })
})
