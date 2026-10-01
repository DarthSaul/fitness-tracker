import { describe, test, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

import handler from './[emoji].put'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockRequireVisible = requireVisiblePost as ReturnType<typeof vi.fn>
const mockSummaries = reactionSummaries as ReturnType<typeof vi.fn>
const mockRateLimitByKey = rateLimitByKey as ReturnType<typeof vi.fn>
const mockWithPairLock = withPairLock as ReturnType<typeof vi.fn>
const mockFindUnique = prisma.postReaction.findUnique as ReturnType<typeof vi.fn>
const mockCount = prisma.postReaction.count as ReturnType<typeof vi.fn>
const mockCreate = prisma.postReaction.create as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string }; node: { res: { statusCode: number } } }

let inLock = false

/** Like h3: the emoji param stays percent-encoded unless `{ decode: true }` is passed. */
function routeParams(id: string | undefined, emoji: string) {
  mockGetRouterParam.mockImplementation((_e: unknown, name: string, opts?: { decode?: boolean }) =>
    name === 'id' ? id : opts?.decode ? emoji : encodeURIComponent(emoji))
}

function makeEvent(): Event {
  return { path: '/api/posts/p1/reactions/x', context: { userId: 'me' }, node: { res: { statusCode: 200 } } }
}
const call = (event: Event) => (handler as unknown as (e: Event) => Promise<unknown>)(event)
const summary = [{ emoji: '👍', count: 1, mine: true }]

describe('PUT /api/posts/:id/reactions/:emoji', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeParams('p1', '👍')
    mockRequireVisible.mockResolvedValue({ id: 'p1', author: { id: 'author', profileVisibility: 'PUBLIC' } })
    mockRateLimitByKey.mockResolvedValue(undefined)
    mockFindUnique.mockResolvedValue(null)
    mockCount.mockResolvedValue(0)
    mockCreate.mockResolvedValue({ id: 'r1' })
    mockSummaries.mockResolvedValue(new Map([['p1', summary]]))
    mockWithPairLock.mockImplementation(async (_a: string, _b: string, fn: (tx: unknown) => unknown) => {
      inLock = true
      try { return await fn(prisma) } finally { inLock = false }
    })
  })

  test("adds the caller's reaction → 201 with the post's summaries", async () => {
    const event = makeEvent()

    const result = await call(event)

    expect(mockRequireVisible).toHaveBeenCalledWith('p1', 'me')
    expect(mockCreate).toHaveBeenCalledWith({ data: { postId: 'p1', userId: 'me', emoji: '👍' } })
    expect(event.node.res.statusCode).toBe(201)
    expect(mockSummaries).toHaveBeenCalledWith(['p1'], 'me')
    expect(result).toEqual({ reactions: summary })
  })

  test('decodes the URL-encoded emoji (h3 leaves it percent-encoded otherwise)', async () => {
    await call(makeEvent())

    expect(mockGetRouterParam).toHaveBeenCalledWith(expect.anything(), 'emoji', { decode: true })
    expect(mockCreate.mock.calls[0]![0].data.emoji).toBe('👍')
  })

  test('stores a bare ❤ as ❤️, so it is the same reaction as ❤️', async () => {
    routeParams('p1', '❤')

    await call(makeEvent())

    expect(mockCreate.mock.calls[0]![0].data.emoji).toBe('❤️')
  })

  test('is idempotent: an existing reaction responds 200 without writing', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'r1' })
    const event = makeEvent()

    await call(event)

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { postId_userId_emoji: { postId: 'p1', userId: 'me', emoji: '👍' } },
      select: { id: true },
    })
    expect(mockCreate).not.toHaveBeenCalled()
    expect(event.node.res.statusCode).toBe(200)
  })

  test('409 at the cap of 10 distinct emoji per user per post — an existing one is still 200', async () => {
    mockCount.mockResolvedValueOnce(10)

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 409 })
    expect(mockCount).toHaveBeenCalledWith({ where: { postId: 'p1', userId: 'me' } })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('9 existing → the 10th is allowed', async () => {
    mockCount.mockResolvedValueOnce(9)
    await call(makeEvent())
    expect(mockCreate).toHaveBeenCalled()
  })

  // The cap check and the insert must not interleave between two concurrent
  // taps by the same user on the same post, or both could pass at 9.
  test('checks the cap and inserts while holding a lock on (user, post)', async () => {
    const calls: string[] = []
    mockFindUnique.mockImplementationOnce(async () => { calls.push(`read:${inLock}`); return null })
    mockCount.mockImplementationOnce(async () => { calls.push(`count:${inLock}`); return 3 })
    mockCreate.mockImplementationOnce(async () => { calls.push(`create:${inLock}`); return { id: 'r1' } })

    await call(makeEvent())

    expect(mockWithPairLock).toHaveBeenCalledWith('me', 'p1', expect.any(Function))
    expect(calls).toEqual(['read:true', 'count:true', 'create:true'])
  })

  test('a duplicate that slips past the read (P2002) is treated as already there → 200', async () => {
    mockCreate.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }))
    const event = makeEvent()

    await call(event)

    expect(event.node.res.statusCode).toBe(200)
  })

  test('404 when the caller cannot see the post — nothing is written', async () => {
    mockRequireVisible.mockRejectedValueOnce(Object.assign(new Error('Post not found'), { statusCode: 404 }))

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 404 })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test.each([['two emoji', '👍👍'], ['text', 'yes'], ['empty', '']])('400 for %s, before any query', async (_label, emoji) => {
    routeParams('p1', emoji)

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 400 })
    expect(mockRequireVisible).not.toHaveBeenCalled()
  })

  test('400 when the post id is missing', async () => {
    routeParams(undefined, '👍')
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 400 })
  })

  test('rate-limits per user, 300 per hour, before touching the post', async () => {
    mockRateLimitByKey.mockRejectedValueOnce(Object.assign(new Error('Too many requests'), { statusCode: 429 }))

    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 429 })
    expect(mockRateLimitByKey).toHaveBeenCalledWith('react:me', 300, '1 h')
    expect(mockRequireVisible).not.toHaveBeenCalled()
  })

  test('500 with a generic message on a database error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('timeout'))
    await expect(call(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to add reaction' })
    expect(logger.error).toHaveBeenCalled()
  })
})
