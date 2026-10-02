import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './username-available.get'

const mockGetQuery = getQuery as ReturnType<typeof vi.fn>
const mockFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>
const mockRateLimitByKey = rateLimitByKey as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }

function call(username: unknown) {
  mockGetQuery.mockReturnValue(username === undefined ? {} : { username })
  return (handler as unknown as (e: Event) => Promise<{ available: boolean; reason?: string }>)({
    path: '/api/users/username-available', context: { userId: 'me' },
  })
}

describe('GET /api/users/username-available', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUnique.mockReset()
    mockFindUnique.mockResolvedValue(null)
    mockRateLimitByKey.mockResolvedValue(undefined)
  })

  test('an unused, valid name is available; the input is normalized first', async () => {
    expect(await call(' @Saul.G ')).toEqual({ available: true })
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { username: 'saul.g' }, select: { id: true } })
  })

  test('a name someone else has is taken', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'ann' })
    expect(await call('saulg')).toEqual({ available: false, reason: 'taken' })
  })

  test('your own current name counts as available to you', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'me' })
    expect(await call('saulg')).toEqual({ available: true })
  })

  test.each([
    ['invalid', 'sa..ul'],
    ['invalid', 'ab'],
    ['reserved', 'Admin'],
  ])('%s names are reported without a lookup', async (reason, name) => {
    expect(await call(name)).toEqual({ available: false, reason })
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  test.each([
    ['missing', undefined],
    ['not a string', ['a', 'b']],
  ])('400 when username is %s', async (_label, name) => {
    await expect(call(name)).rejects.toMatchObject({ statusCode: 400 })
  })

  test('rate-limits per user, 60 per minute, before the lookup', async () => {
    mockRateLimitByKey.mockRejectedValueOnce(Object.assign(new Error('Too many requests'), { statusCode: 429 }))

    await expect(call('saulg')).rejects.toMatchObject({ statusCode: 429 })
    expect(mockRateLimitByKey).toHaveBeenCalledWith('username-check:me', 60, '1 m')
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  test('500 with a generic message on a database error', async () => {
    mockFindUnique.mockRejectedValueOnce(new Error('timeout'))
    await expect(call('saulg')).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to check username' })
    expect(logger.error).toHaveBeenCalled()
  })
})
