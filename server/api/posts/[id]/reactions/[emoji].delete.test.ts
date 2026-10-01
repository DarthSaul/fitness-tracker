import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[emoji].delete'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockRequireVisible = requireVisiblePost as ReturnType<typeof vi.fn>
const mockDeleteMany = prisma.postReaction.deleteMany as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string }; node: { res: { statusCode: number } } }

function routeParams(id: string | undefined, emoji: string) {
  mockGetRouterParam.mockImplementation((_e: unknown, name: string, opts?: { decode?: boolean }) =>
    name === 'id' ? id : opts?.decode ? emoji : encodeURIComponent(emoji))
}
function makeEvent(): Event {
  return { path: '/api/posts/p1/reactions/x', context: { userId: 'me' }, node: { res: { statusCode: 200 } } }
}
const call = (event: Event) => (handler as unknown as (e: Event) => Promise<null>)(event)

describe('DELETE /api/posts/:id/reactions/:emoji', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeParams('p1', '👍')
    mockRequireVisible.mockResolvedValue({ id: 'p1', author: { id: 'a', profileVisibility: 'PUBLIC' } })
    mockDeleteMany.mockResolvedValue({ count: 1 })
  })

  test("removes only the caller's own reaction → 204", async () => {
    const event = makeEvent()

    const result = await call(event)

    expect(mockRequireVisible).toHaveBeenCalledWith('p1', 'me')
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { postId: 'p1', userId: 'me', emoji: '👍' } })
    expect(event.node.res.statusCode).toBe(204)
    expect(result).toBeNull()
  })

  test('is idempotent: 204 when there was nothing to remove', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 0 })
    const event = makeEvent()

    await call(event)

    expect(event.node.res.statusCode).toBe(204)
  })

  test('decodes the emoji and normalizes a bare ❤, so it removes the stored ❤️', async () => {
    routeParams('p1', '❤')

    await call(makeEvent())

    expect(mockGetRouterParam).toHaveBeenCalledWith(expect.anything(), 'emoji', { decode: true })
    expect(mockDeleteMany.mock.calls[0]![0].where.emoji).toBe('❤️')
  })

  test('404 when the caller cannot see the post — nothing is removed', async () => {
    mockRequireVisible.mockRejectedValueOnce(Object.assign(new Error('Post not found'), { statusCode: 404 }))

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 404 })
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })

  test('400 for an invalid emoji or a missing post id', async () => {
    routeParams('p1', 'nope')
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 400 })
    routeParams(undefined, '👍')
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 400 })
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })

  test('500 with a generic message on a database error', async () => {
    mockDeleteMany.mockRejectedValueOnce(new Error('timeout'))
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to remove reaction' })
    expect(logger.error).toHaveBeenCalled()
  })
})
