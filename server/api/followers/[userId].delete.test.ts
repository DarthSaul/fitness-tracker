import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[userId].delete'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockDeleteMany = prisma.follow.deleteMany as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string }; node: { res: { statusCode: number } } }

function makeEvent(): Event {
  return { path: '/api/followers/bo', context: { userId: 'me' }, node: { res: { statusCode: 200 } } }
}
const call = (event: Event) => (handler as unknown as (e: Event) => Promise<null>)(event)

describe('DELETE /api/followers/:userId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRouterParam.mockReturnValue('bo')
    mockDeleteMany.mockResolvedValue({ count: 1 })
  })

  test('removes their accepted follow of me → 204 (pending requests are declined via follow-requests)', async () => {
    const event = makeEvent()

    const result = await call(event)

    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { followerId: 'bo', followeeId: 'me', status: 'ACCEPTED' } })
    expect(event.node.res.statusCode).toBe(204)
    expect(result).toBeNull()
  })

  test('is idempotent: 204 when they were not a follower', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 0 })
    const event = makeEvent()

    await call(event)

    expect(event.node.res.statusCode).toBe(204)
  })

  test('400 when the userId param is missing', async () => {
    mockGetRouterParam.mockReturnValue(undefined)
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 400 })
  })

  test('500 with a generic message on a database error', async () => {
    mockDeleteMany.mockRejectedValueOnce(new Error('timeout'))
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to remove follower' })
    expect(logger.error).toHaveBeenCalled()
  })
})
