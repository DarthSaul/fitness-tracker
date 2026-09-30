import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[userId].delete'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockDeleteMany = prisma.userBlock.deleteMany as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string }; node: { res: { statusCode: number } } }

function makeEvent(target = 'bob'): Event {
  mockGetRouterParam.mockReturnValue(target)
  return { path: `/api/blocks/${target}`, context: { userId: 'alice' }, node: { res: { statusCode: 200 } } }
}

const call = (event: Event) => (handler as unknown as (e: Event) => Promise<null>)(event)

describe('DELETE /api/blocks/:userId', () => {
  beforeEach(() => vi.clearAllMocks())

  test("removes only the caller's block and responds 204", async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 1 })
    const event = makeEvent()

    const result = await call(event)

    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { blockerId: 'alice', blockedId: 'bob' } })
    expect(event.node.res.statusCode).toBe(204)
    expect(result).toBeNull()
  })

  test('is idempotent: 204 when no block existed', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 0 })
    const event = makeEvent()

    await call(event)

    expect(event.node.res.statusCode).toBe(204)
  })

  test('400 when the userId param is missing', async () => {
    const event = makeEvent()
    mockGetRouterParam.mockReturnValue(undefined)
    await expect(call(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })

  test('500 with a generic message on a database error', async () => {
    mockDeleteMany.mockRejectedValueOnce(new Error('timeout'))
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to unblock user' })
    expect(logger.error).toHaveBeenCalled()
  })
})
