import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].delete'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockFindUnique = prisma.friendship.findUnique as ReturnType<typeof vi.fn>
const mockDeleteMany = prisma.friendship.deleteMany as ReturnType<typeof vi.fn>
const mockWithPairLock = withPairLock as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string }; node: { res: { statusCode: number } } }

const ME = 'cm'
const pending = { userLowId: 'ca', userHighId: ME, status: 'PENDING' }
let inLock = false

function makeEvent(): Event {
  return { path: '/api/friend-requests/f1', context: { userId: ME }, node: { res: { statusCode: 200 } } }
}
const call = (event: Event) => (handler as unknown as (e: Event) => Promise<null>)(event)

describe('DELETE /api/friend-requests/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRouterParam.mockReturnValue('f1')
    mockFindUnique.mockResolvedValue(pending)
    mockDeleteMany.mockResolvedValue({ count: 1 })
    mockWithPairLock.mockImplementation(async (_a: string, _b: string, fn: (tx: unknown) => unknown) => {
      inLock = true
      try { return await fn(prisma) } finally { inLock = false }
    })
  })

  test('deletes a pending request the caller is part of (cancel or decline) → 204', async () => {
    const event = makeEvent()

    const result = await call(event)

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'f1' },
      select: { userLowId: true, userHighId: true, status: true },
    })
    // Still guarded: the row may have changed between the read and the lock.
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: 'f1', status: 'PENDING', OR: [{ userLowId: ME }, { userHighId: ME }] },
    })
    expect(event.node.res.statusCode).toBe(204)
    expect(result).toBeNull()
  })

  test('deletes while holding the pair lock', async () => {
    const calls: string[] = []
    mockDeleteMany.mockImplementationOnce(async () => { calls.push(inLock ? 'locked' : 'UNLOCKED'); return { count: 1 } })

    await call(makeEvent())

    expect(mockWithPairLock).toHaveBeenCalledWith('ca', ME, expect.any(Function))
    expect(calls).toEqual(['locked'])
  })

  test.each([
    ['it does not exist', null],
    ['it is already a friendship', { ...pending, status: 'ACCEPTED' }],
    ['the caller is not part of the pair', { userLowId: 'ca', userHighId: 'cz', status: 'PENDING' }],
  ])('404 without locking when %s', async (_label, row) => {
    mockFindUnique.mockResolvedValueOnce(row)

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Friend request not found' })
    expect(mockWithPairLock).not.toHaveBeenCalled()
  })

  test('404 when it was accepted or removed between the read and the lock', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 0 })
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Friend request not found' })
  })

  test('400 when the id param is missing', async () => {
    mockGetRouterParam.mockReturnValue(undefined)
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 400 })
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  test('500 with a generic message on a database error', async () => {
    mockFindUnique.mockRejectedValueOnce(new Error('timeout'))
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to remove friend request' })
    expect(logger.error).toHaveBeenCalled()
  })
})
