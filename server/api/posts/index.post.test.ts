import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.post'

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockCreate = prisma.post.create as ReturnType<typeof vi.fn>
const mockRateLimitByKey = rateLimitByKey as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string }; node: { res: { statusCode: number } } }

const me = { id: 'ca', name: 'Ada', avatarUrl: null, profileVisibility: 'PRIVATE' }
const createdAt = new Date('2026-09-30T12:00:00.000Z')
const row = (overrides = {}) => ({
  id: 'p1', authorId: 'ca', body: 'Leg day', createdAt, editedAt: null, author: me, ...overrides,
})

function makeEvent(): Event {
  return { path: '/api/posts', context: { userId: 'ca' }, node: { res: { statusCode: 200 } } }
}
const call = (event: Event) => (handler as unknown as (e: Event) => Promise<unknown>)(event)

describe('POST /api/posts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateLimitByKey.mockResolvedValue(undefined)
    mockCreate.mockResolvedValue(row())
  })

  test('creates a post authored by the caller with a trimmed body → 201 Post', async () => {
    mockReadBody.mockResolvedValueOnce({ body: '  Leg day  ' })
    const event = makeEvent()

    const result = await call(event)

    expect(mockCreate).toHaveBeenCalledWith({
      data: { authorId: 'ca', body: 'Leg day' },
      select: expect.objectContaining({ id: true, author: { select: { id: true, name: true, avatarUrl: true, profileVisibility: true } } }),
    })
    expect(event.node.res.statusCode).toBe(201)
    expect(result).toEqual({
      id: 'p1', author: me, body: 'Leg day', createdAt, editedAt: null, isMine: true,
    })
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
    ['empty body', { body: '' }],
    ['whitespace body', { body: '   ' }],
    ['body over 2000 characters', { body: 'x'.repeat(2001) }],
  ])('400 on %s', async (_label, body) => {
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
