import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].get'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>
const mockCount = prisma.follow.count as ReturnType<typeof vi.fn>
const mockIsBlocked = isBlockedEitherWay as ReturnType<typeof vi.fn>
const mockFollowStatesWith = followStatesWith as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }
type Result = Record<string, unknown>

function call(id: string | undefined) {
  mockGetRouterParam.mockReturnValue(id)
  return (handler as unknown as (e: Event) => Promise<Result>)({ path: `/api/users/${id}`, context: { userId: 'alice' } })
}

const bob = { id: 'bob', name: 'Bob', avatarUrl: 'https://img/b.png', profileVisibility: 'PRIVATE' }
const none = { isSelf: false, outgoing: 'none', incoming: 'none', incomingRequestId: null }

describe('GET /api/users/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUnique.mockResolvedValue(bob)
    mockIsBlocked.mockResolvedValue(false)
    mockCount.mockResolvedValue(0)
    mockFollowStatesWith.mockImplementation(async (me: string, ids: string[]) =>
      new Map(ids.map((id) => [id, { ...none, isSelf: id === me }])))
  })

  test('returns the public profile with follow state and accepted-only counts', async () => {
    mockCount.mockResolvedValueOnce(12).mockResolvedValueOnce(3)

    const result = await call('bob')

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'bob' },
      select: { id: true, name: true, avatarUrl: true, profileVisibility: true, username: true, bio: true },
    })
    expect(mockCount).toHaveBeenCalledWith({ where: { followeeId: 'bob', status: 'ACCEPTED' } })
    expect(mockCount).toHaveBeenCalledWith({ where: { followerId: 'bob', status: 'ACCEPTED' } })
    expect(result).toEqual({ ...bob, ...none, followerCount: 12, followingCount: 3 })
  })

  test('carries incomingRequestId so their request can be accepted from the profile', async () => {
    mockFollowStatesWith.mockResolvedValueOnce(new Map([['bob', { ...none, incoming: 'requested', incomingRequestId: 'r1' }]]))

    const result = await call('bob')

    expect(mockFollowStatesWith).toHaveBeenCalledWith('alice', ['bob'])
    expect(result).toMatchObject({ incoming: 'requested', incomingRequestId: 'r1' })
  })

  test('a private profile is still visible — only its posts are gated', async () => {
    await expect(call('bob')).resolves.toMatchObject({ id: 'bob', profileVisibility: 'PRIVATE' })
  })

  test('the caller may fetch their own profile', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'alice', name: 'Alice', avatarUrl: null, profileVisibility: 'PUBLIC' })
    await expect(call('alice')).resolves.toMatchObject({ id: 'alice', isSelf: true })
  })

  test('404 when the user does not exist', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    await expect(call('ghost')).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User not found' })
  })

  test('404 — identical to not-found — when a block exists either way', async () => {
    mockIsBlocked.mockResolvedValueOnce(true)

    await expect(call('bob')).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User not found' })
    expect(mockIsBlocked).toHaveBeenCalledWith('alice', 'bob')
    expect(mockCount).not.toHaveBeenCalled()
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
