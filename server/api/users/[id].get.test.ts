import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].get'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>
const mockIsBlocked = isBlockedEitherWay as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }
type Result = { id: string; name: string | null; avatarUrl: string | null }

function call(id: string | undefined) {
  mockGetRouterParam.mockReturnValue(id)
  return (handler as unknown as (e: Event) => Promise<Result>)({ path: `/api/users/${id}`, context: { userId: 'alice' } })
}

const bob = { id: 'bob', name: 'Bob', avatarUrl: 'https://img/b.png' }

describe('GET /api/users/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUnique.mockResolvedValue(bob)
    mockIsBlocked.mockResolvedValue(false)
  })

  test('returns the public profile — public fields only', async () => {
    const result = await call('bob')

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'bob' },
      select: { id: true, name: true, avatarUrl: true },
    })
    expect(result).toEqual(bob)
  })

  test('the caller may fetch their own profile', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'alice', name: 'Alice', avatarUrl: null })
    await expect(call('alice')).resolves.toMatchObject({ id: 'alice' })
  })

  test('404 when the user does not exist', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    await expect(call('ghost')).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User not found' })
  })

  test('404 — identical to not-found — when a block exists either way', async () => {
    mockIsBlocked.mockResolvedValueOnce(true)

    await expect(call('bob')).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User not found' })
    expect(mockIsBlocked).toHaveBeenCalledWith('alice', 'bob')
  })

  test('400 when the id param is missing', async () => {
    await expect(call(undefined)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  test('500 with a generic message on a database error', async () => {
    mockFindUnique.mockRejectedValueOnce(new Error('timeout'))
    await expect(call('bob')).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch user' })
    expect(logger.error).toHaveBeenCalled()
  })
})
