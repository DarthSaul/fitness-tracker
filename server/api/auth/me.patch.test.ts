/**
 * Tests for server/api/auth/me.patch.ts
 *
 * Coverage strategy:
 *  - Happy path: updates ptRoutineInWorkout and returns the profile shape
 *  - Validation: 400 for non-object body, no recognised field, bad values
 *  - Profile privacy: profileVisibility updates; going public accepts pending
 *    follow requests in the same transaction, after the user row update
 *  - Not found: throws 404 when the user record is missing
 *  - Error propagation: throws 500 on unexpected error
 *  - H3 error pass-through: re-throws H3 errors without wrapping as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './me.patch'

const mockFindUniqueUser = (prisma as typeof prisma).user.findUnique as ReturnType<typeof vi.fn>
const mockUpdateUser = (prisma as typeof prisma).user.update as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>
const mockTransaction = (prisma as typeof prisma).$transaction as ReturnType<typeof vi.fn>
const mockUpdateManyFollows = (prisma as typeof prisma).follow.updateMany as ReturnType<typeof vi.fn>

const meSelect = { id: true, email: true, name: true, avatarUrl: true, ptRoutineInWorkout: true, profileVisibility: true }

function makeEvent(body: unknown = { ptRoutineInWorkout: true }) {
  mockReadBody.mockResolvedValue(body)
  return {
    path: '/api/auth/me',
    context: { userId: 'user001' },
  }
}

const mockUpdatedUser = {
  id: 'user001',
  email: 'jane@example.com',
  name: 'Jane Appleseed',
  avatarUrl: null,
  ptRoutineInWorkout: true,
  profileVisibility: 'PRIVATE',
}

describe('PATCH /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockFindUniqueUser.mockResolvedValue({ id: 'user001', profileVisibility: 'PRIVATE' })
    mockTransaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma))
    mockUpdateManyFollows.mockResolvedValue({ count: 0 })
  })

  test('updates ptRoutineInWorkout and returns the profile', async () => {
    mockUpdateUser.mockResolvedValueOnce(mockUpdatedUser)

    const event = makeEvent({ ptRoutineInWorkout: true })
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockUpdatedUser)
    expect(mockUpdateUser).toHaveBeenCalledWith({
      where: { id: 'user001' },
      data: { ptRoutineInWorkout: true },
      select: meSelect,
    })
  })

  test('accepts false as a value', async () => {
    mockUpdateUser.mockResolvedValueOnce({ ...mockUpdatedUser, ptRoutineInWorkout: false })

    const event = makeEvent({ ptRoutineInWorkout: false })
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockUpdateUser).toHaveBeenCalledWith(
      expect.objectContaining({ data: { ptRoutineInWorkout: false } }),
    )
  })

  test.each([
    ['body is an array', ['nope'], 'Invalid request body'],
    ['body is a string', 'nope', 'Invalid request body'],
    ['no recognised field', {}, 'Provide ptRoutineInWorkout and/or profileVisibility'],
    ['body is null', null, 'Provide ptRoutineInWorkout and/or profileVisibility'],
    ['value is not a boolean', { ptRoutineInWorkout: 'yes' }, 'ptRoutineInWorkout must be a boolean'],
    ['profileVisibility is invalid', { profileVisibility: 'FRIENDS' }, 'profileVisibility must be PUBLIC or PRIVATE'],
    ['profileVisibility is lowercase', { profileVisibility: 'public' }, 'profileVisibility must be PUBLIC or PRIVATE'],
  ])('throws 400 when %s', async (_label, body, statusMessage) => {
    const event = makeEvent(body)
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage })
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  test('updates profileVisibility alone (ptRoutineInWorkout is now optional)', async () => {
    mockFindUniqueUser.mockResolvedValueOnce({ id: 'user001', profileVisibility: 'PUBLIC' })
    mockUpdateUser.mockResolvedValueOnce({ ...mockUpdatedUser, profileVisibility: 'PRIVATE' })

    const event = makeEvent({ profileVisibility: 'PRIVATE' })
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockUpdateUser).toHaveBeenCalledWith({
      where: { id: 'user001' },
      data: { profileVisibility: 'PRIVATE' },
      select: meSelect,
    })
    // Going private keeps existing followers.
    expect(mockUpdateManyFollows).not.toHaveBeenCalled()
  })

  test('going PRIVATE → PUBLIC accepts every pending request, after the user row update, in one transaction', async () => {
    mockUpdateUser.mockResolvedValueOnce({ ...mockUpdatedUser, profileVisibility: 'PUBLIC' })
    mockUpdateManyFollows.mockResolvedValueOnce({ count: 3 })

    const event = makeEvent({ profileVisibility: 'PUBLIC' })
    const result = await (handler as unknown as (e: typeof event) => Promise<{ profileVisibility: string }>)(event)

    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(mockUpdateManyFollows).toHaveBeenCalledWith({
      where: { followeeId: 'user001', status: 'PENDING' },
      data: { status: 'ACCEPTED', acceptedAt: expect.any(Date) },
    })
    // The user row is updated first: POST /api/following reads it FOR SHARE,
    // so a request inserted concurrently is either seen as PUBLIC or accepted here.
    expect(mockUpdateUser.mock.invocationCallOrder[0]!).toBeLessThan(mockUpdateManyFollows.mock.invocationCallOrder[0]!)
    expect(result.profileVisibility).toBe('PUBLIC')
  })

  test('staying PUBLIC does not touch follow requests', async () => {
    mockFindUniqueUser.mockResolvedValueOnce({ id: 'user001', profileVisibility: 'PUBLIC' })
    mockUpdateUser.mockResolvedValueOnce({ ...mockUpdatedUser, profileVisibility: 'PUBLIC' })

    const event = makeEvent({ profileVisibility: 'PUBLIC' })
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockUpdateManyFollows).not.toHaveBeenCalled()
  })

  test('updates both fields together', async () => {
    mockUpdateUser.mockResolvedValueOnce(mockUpdatedUser)

    const event = makeEvent({ ptRoutineInWorkout: false, profileVisibility: 'PRIVATE' })
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockUpdateUser.mock.calls[0]![0].data).toEqual({ ptRoutineInWorkout: false, profileVisibility: 'PRIVATE' })
  })

  test('throws 404 when user record is missing', async () => {
    mockFindUniqueUser.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User not found' })
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockUpdateUser.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to update current user' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'PATCH /api/auth/me' }, '[PATCH /api/auth/me] Failed to update current user')
    consoleSpy.mockRestore()
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('User not found') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'User not found'
    mockFindUniqueUser.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
