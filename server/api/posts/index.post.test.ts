import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.post'

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockCreate = prisma.post.create as ReturnType<typeof vi.fn>
const mockFindUnique = prisma.post.findUnique as ReturnType<typeof vi.fn>
const mockAttach = prisma.postPhoto.updateMany as ReturnType<typeof vi.fn>
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>
const mockRateLimitByKey = rateLimitByKey as ReturnType<typeof vi.fn>
const mockSign = signPostPhotos as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string }; node: { res: { statusCode: number } } }

const me = { id: 'ca', name: 'Ada', avatarUrl: null, profileVisibility: 'PRIVATE' }
const createdAt = new Date('2026-09-30T12:00:00.000Z')
const row = (overrides = {}) => ({
  id: 'p1', authorId: 'ca', body: 'Leg day', createdAt, editedAt: null, author: me, photos: [], ...overrides,
})

function makeEvent(): Event {
  return { path: '/api/posts', context: { userId: 'ca' }, node: { res: { statusCode: 200 } } }
}
const call = (event: Event) => (handler as unknown as (e: Event) => Promise<Record<string, unknown>>)(event)

describe('POST /api/posts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateLimitByKey.mockResolvedValue(undefined)
    mockTransaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma))
    mockCreate.mockResolvedValue({ id: 'p1' })
    mockFindUnique.mockResolvedValue(row())
    mockAttach.mockResolvedValue({ count: 1 })
    mockSign.mockResolvedValue({ urls: new Map(), expiresAt: null })
  })

  test('creates a text post authored by the caller with a trimmed body → 201 Post', async () => {
    mockReadBody.mockResolvedValueOnce({ body: '  Leg day  ' })
    const event = makeEvent()

    const result = await call(event)

    expect(mockCreate).toHaveBeenCalledWith({ data: { authorId: 'ca', body: 'Leg day' }, select: { id: true } })
    expect(mockAttach).not.toHaveBeenCalled()
    expect(event.node.res.statusCode).toBe(201)
    expect(result).toEqual({
      id: 'p1', author: me, body: 'Leg day', createdAt, editedAt: null, isMine: true, photos: [], photosExpireAt: null,
    })
  })

  test('attaches photos in the given order, each guarded on "mine and not yet attached", in one transaction', async () => {
    mockReadBody.mockResolvedValueOnce({ body: 'Leg day', photoIds: ['ph2', 'ph1'] })
    mockFindUnique.mockResolvedValueOnce(row({
      photos: [
        { id: 'ph2', storagePath: 'ca/ph2.jpg', width: 10, height: 20 },
        { id: 'ph1', storagePath: 'ca/ph1.jpg', width: 30, height: 40 },
      ],
    }))
    mockSign.mockResolvedValueOnce({
      urls: new Map([['ca/ph2.jpg', 'https://s/2'], ['ca/ph1.jpg', 'https://s/1']]),
      expiresAt: '2026-09-30T12:15:00.000Z',
    })

    const result = await call(makeEvent())

    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(mockAttach).toHaveBeenNthCalledWith(1, {
      where: { id: 'ph2', uploaderId: 'ca', postId: null },
      data: { postId: 'p1', position: 0 },
    })
    expect(mockAttach).toHaveBeenNthCalledWith(2, {
      where: { id: 'ph1', uploaderId: 'ca', postId: null },
      data: { postId: 'p1', position: 1 },
    })
    expect(result.photos).toEqual([
      { id: 'ph2', url: 'https://s/2', width: 10, height: 20 },
      { id: 'ph1', url: 'https://s/1', width: 30, height: 40 },
    ])
    expect(result.photosExpireAt).toBe('2026-09-30T12:15:00.000Z')
  })

  test('a photo-only post has an empty body', async () => {
    mockReadBody.mockResolvedValueOnce({ photoIds: ['ph1'] })

    await call(makeEvent())

    expect(mockCreate.mock.calls[0]![0].data).toEqual({ authorId: 'ca', body: '' })
  })

  // Someone else's photo, one already attached (including by a concurrent
  // request — the guarded updateMany then matches 0 rows), or an unknown id.
  test('400 naming the photo when it is not the caller\'s own unattached upload — the transaction rolls back', async () => {
    mockReadBody.mockResolvedValueOnce({ body: 'Leg day', photoIds: ['ph1', 'taken'] })
    mockAttach.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid photo: taken' })
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  test('a legacy visibility key is ignored — privacy is per profile now', async () => {
    mockReadBody.mockResolvedValueOnce({ body: 'Leg day', visibility: 'PUBLIC' })

    await call(makeEvent())

    expect(mockCreate.mock.calls[0]![0].data).toEqual({ authorId: 'ca', body: 'Leg day' })
  })

  test('takes the author from the session, never the body', async () => {
    mockReadBody.mockResolvedValueOnce({ body: 'Leg day', authorId: 'mallory' })

    await call(makeEvent())

    expect(mockCreate.mock.calls[0]![0].data.authorId).toBe('ca')
  })

  test.each([
    ['missing body', undefined],
    ['empty body, no photos', { body: '' }],
    ['whitespace body, no photos', { body: '   ' }],
    ['body over 2000 characters', { body: 'x'.repeat(2001) }],
    ['5 photos', { photoIds: ['a', 'b', 'c', 'd', 'e'] }],
    ['a duplicate photo', { photoIds: ['a', 'a'] }],
  ])('400 on %s, before any write', async (_label, body) => {
    mockReadBody.mockResolvedValueOnce(body)
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 400 })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('rate-limits per user, 30 per hour, before writing', async () => {
    mockReadBody.mockResolvedValueOnce({ body: 'Leg day' })
    mockRateLimitByKey.mockRejectedValueOnce(Object.assign(new Error('Too many requests'), { statusCode: 429 }))

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 429 })
    expect(mockRateLimitByKey).toHaveBeenCalledWith('post-create:ca', 30, '1 h')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('500 with a generic message on a database error', async () => {
    mockReadBody.mockResolvedValueOnce({ body: 'Leg day' })
    mockCreate.mockRejectedValueOnce(new Error('timeout'))

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to create post' })
    expect(logger.error).toHaveBeenCalled()
  })
})
