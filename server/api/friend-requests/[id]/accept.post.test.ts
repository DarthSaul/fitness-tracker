import { describe, test, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

import handler from './accept.post'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockFindUnique = prisma.friendship.findUnique as ReturnType<typeof vi.fn>
const mockUpdate = prisma.friendship.update as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string } }

const ME = 'cm'
const alice = { id: 'ca', name: 'Alice', avatarUrl: null }
const me = { id: ME, name: 'Me', avatarUrl: null }
const createdAt = new Date('2026-09-29T12:00:00.000Z')
const acceptedAt = new Date('2026-09-29T13:00:00.000Z')

const pendingFromAlice = {
  id: 'f1', requesterId: 'ca', status: 'PENDING', createdAt, acceptedAt: null,
  userLowId: 'ca', userHighId: ME, userLow: alice, userHigh: me,
}

function call(id: string | undefined = 'f1', userId = ME) {
  mockGetRouterParam.mockReturnValue(id)
  return (handler as unknown as (e: Event) => Promise<unknown>)({ path: `/api/friend-requests/${id}/accept`, context: { userId } })
}

describe('POST /api/friend-requests/:id/accept', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUnique.mockResolvedValue(pendingFromAlice)
    mockUpdate.mockResolvedValue({ ...pendingFromAlice, status: 'ACCEPTED', acceptedAt })
  })

  test('the addressee accepts: row becomes ACCEPTED and the requester is returned as a friend', async () => {
    const result = await call()

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'f1', status: 'PENDING' },
      data: { status: 'ACCEPTED', acceptedAt: expect.any(Date) },
      select: { id: true, requesterId: true, status: true, createdAt: true, acceptedAt: true },
    })
    expect(result).toEqual({ friend: { ...alice, friendsSince: acceptedAt } })
  })

  test.each([
    ['the requester tries to accept their own request', { ...pendingFromAlice, requesterId: ME }],
    ['the request is already accepted', { ...pendingFromAlice, status: 'ACCEPTED', acceptedAt }],
    ['the caller is not part of the pair', { ...pendingFromAlice, userHighId: 'cz', userHigh: { id: 'cz', name: 'Zed', avatarUrl: null } }],
    ['the request does not exist', null],
  ])('404 when %s', async (_label, row) => {
    mockFindUnique.mockResolvedValueOnce(row)

    await expect(call()).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Friend request not found' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test('404 when the request is withdrawn between read and write (P2025)', async () => {
    mockUpdate.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'test' }))
    await expect(call()).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Friend request not found' })
  })

  test('400 when the id param is missing', async () => {
    mockGetRouterParam.mockReturnValue(undefined)
    await expect(
      (handler as unknown as (e: Event) => Promise<unknown>)({ path: '/api/friend-requests//accept', context: { userId: ME } }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  test('500 with a generic message on a database error', async () => {
    mockFindUnique.mockRejectedValueOnce(new Error('timeout'))
    await expect(call()).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to accept friend request' })
    expect(logger.error).toHaveBeenCalled()
  })
})
