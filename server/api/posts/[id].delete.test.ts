import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].delete'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockDeleteMany = prisma.post.deleteMany as ReturnType<typeof vi.fn>
const mockFindPhotos = prisma.postPhoto.findMany as ReturnType<typeof vi.fn>
const mockRemoveObjects = removePostPhotoObjects as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string }; node: { res: { statusCode: number } } }

function makeEvent(): Event {
  return { path: '/api/posts/p1', context: { userId: 'ca' }, node: { res: { statusCode: 200 } } }
}
const call = (event: Event) => (handler as unknown as (e: Event) => Promise<null>)(event)

describe('DELETE /api/posts/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRouterParam.mockReturnValue('p1')
    mockFindPhotos.mockResolvedValue([])
  })

  test("deletes the caller's own post in one ownership-guarded query → 204", async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 1 })
    const event = makeEvent()

    const result = await call(event)

    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: 'p1', authorId: 'ca' } })
    expect(event.node.res.statusCode).toBe(204)
    expect(result).toBeNull()
  })

  test('removes the photo objects from storage after the rows are gone (rows cascade; objects do not)', async () => {
    mockFindPhotos.mockResolvedValueOnce([{ storagePath: 'ca/a.jpg' }, { storagePath: 'ca/b.jpg' }])
    mockDeleteMany.mockResolvedValueOnce({ count: 1 })

    await call(makeEvent())

    // Only this caller's own post's photos are looked up.
    expect(mockFindPhotos).toHaveBeenCalledWith({
      where: { postId: 'p1', post: { authorId: 'ca' } },
      select: { storagePath: true },
    })
    expect(mockRemoveObjects).toHaveBeenCalledWith(['ca/a.jpg', 'ca/b.jpg'], expect.anything(), 'DELETE /api/posts/:id')
    expect(mockDeleteMany.mock.invocationCallOrder[0]!).toBeLessThan(mockRemoveObjects.mock.invocationCallOrder[0]!)
  })

  test("404 when nothing matched — someone else's post, or gone — and no storage is touched", async () => {
    mockFindPhotos.mockResolvedValueOnce([])
    mockDeleteMany.mockResolvedValueOnce({ count: 0 })

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Post not found' })
    expect(mockRemoveObjects).not.toHaveBeenCalled()
  })

  test('400 when the id param is missing', async () => {
    mockGetRouterParam.mockReturnValue(undefined)
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 400 })
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })

  test('500 with a generic message on a database error', async () => {
    mockDeleteMany.mockRejectedValueOnce(new Error('timeout'))
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to delete post' })
    expect(logger.error).toHaveBeenCalled()
  })
})
