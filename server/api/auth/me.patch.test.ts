/**
 * Tests for server/api/auth/me.patch.ts
 *
 * Coverage strategy:
 *  - Happy path: updates ptRoutineInWorkout and returns the profile shape
 *  - Validation: 400 for non-object body, no recognised field, bad values
 *  - Profile privacy: profileVisibility updates; going public accepts pending
 *    follow requests. Every path locks the user row FOR UPDATE, then decides
 *    and writes in one transaction (PR #135 review)
 *  - Not found: throws 404 when the user record is missing
 *  - Error propagation: throws 500 on unexpected error
 *  - H3 error pass-through: re-throws H3 errors without wrapping as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

import handler from './me.patch'

// The current state is read inside the transaction with a row lock (SELECT … FOR UPDATE).
const mockLockUser = (prisma as typeof prisma).$queryRaw as ReturnType<typeof vi.fn>
const mockUpdateUser = (prisma as typeof prisma).user.update as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>
const mockTransaction = (prisma as typeof prisma).$transaction as ReturnType<typeof vi.fn>
const mockUpdateManyFollows = (prisma as typeof prisma).follow.updateMany as ReturnType<typeof vi.fn>

const meSelect = { id: true, email: true, name: true, avatarUrl: true, ptRoutineInWorkout: true, profileVisibility: true, username: true, bio: true }

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
    mockLockUser.mockResolvedValue([{ profileVisibility: 'PRIVATE' }])
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
    ['no recognised field', {}, 'Provide at least one of ptRoutineInWorkout, profileVisibility, username, bio'],
    ['body is null', null, 'Provide at least one of ptRoutineInWorkout, profileVisibility, username, bio'],
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
    mockLockUser.mockResolvedValueOnce([{ profileVisibility: 'PUBLIC' }])
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

  test('going PRIVATE → PUBLIC accepts every pending request, in the same transaction as the update', async () => {
    mockUpdateUser.mockResolvedValueOnce({ ...mockUpdatedUser, profileVisibility: 'PUBLIC' })
    mockUpdateManyFollows.mockResolvedValueOnce({ count: 3 })

    const event = makeEvent({ profileVisibility: 'PUBLIC' })
    const result = await (handler as unknown as (e: typeof event) => Promise<{ profileVisibility: string }>)(event)

    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(mockUpdateManyFollows).toHaveBeenCalledWith({
      where: { followeeId: 'user001', status: 'PENDING' },
      data: { status: 'ACCEPTED', acceptedAt: expect.any(Date) },
    })
    expect(mockUpdateUser.mock.invocationCallOrder[0]!).toBeLessThan(mockUpdateManyFollows.mock.invocationCallOrder[0]!)
    expect(result.profileVisibility).toBe('PUBLIC')
  })

  test('staying PUBLIC does not touch follow requests', async () => {
    mockLockUser.mockResolvedValueOnce([{ profileVisibility: 'PUBLIC' }])
    mockUpdateUser.mockResolvedValueOnce({ ...mockUpdatedUser, profileVisibility: 'PUBLIC' })

    const event = makeEvent({ profileVisibility: 'PUBLIC' })
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockUpdateManyFollows).not.toHaveBeenCalled()
  })

  // Regression (PR #135 review): goingPublic used to be decided from a read
  // outside any transaction. Two overlapping PATCHes (PRIVATE, then PUBLIC)
  // could leave the profile PUBLIC without accepting a request made in between.
  // Now every path locks the row first and decides from the locked state.
  test.each([
    ['going public', { profileVisibility: 'PUBLIC' }, [{ profileVisibility: 'PRIVATE' }]],
    ['going private', { profileVisibility: 'PRIVATE' }, [{ profileVisibility: 'PUBLIC' }]],
    ['a settings-only change', { ptRoutineInWorkout: true }, [{ profileVisibility: 'PRIVATE' }]],
  ])('%s: locks the user row FOR UPDATE inside one transaction before deciding or writing', async (_label, body, locked) => {
    mockLockUser.mockResolvedValueOnce(locked)
    mockUpdateUser.mockResolvedValueOnce(mockUpdatedUser)

    const event = makeEvent(body)
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockTransaction).toHaveBeenCalledTimes(1)
    const [strings, ...values] = mockLockUser.mock.calls[0]!
    expect((strings as string[]).join('?')).toMatch(/FROM "User".*FOR UPDATE/s)
    expect(values).toEqual(['user001'])
    expect(mockLockUser.mock.invocationCallOrder[0]!).toBeLessThan(mockUpdateUser.mock.invocationCallOrder[0]!)
  })

  describe('username and bio', () => {
    const update = async (body: unknown) => {
      mockUpdateUser.mockResolvedValueOnce(mockUpdatedUser)
      const event = makeEvent(body)
      await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)
      return mockUpdateUser.mock.calls[0]![0].data
    }

    test('a username is normalized before saving: "@SaulG" → "saulg"', async () => {
      expect(await update({ username: ' @SaulG ' })).toEqual({ username: 'saulg' })
    })

    test.each([
      ['invalid', { username: 'sa..ul' }],
      ['reserved', { username: 'Admin' }],
      ['not a string', { username: 42 }],
      ['null (a username is required)', { username: null }],
    ])('400 for a %s username, before any write', async (_label, body) => {
      const event = makeEvent(body)
      await expect((handler as unknown as (e: typeof event) => Promise<unknown>)(event)).rejects.toMatchObject({ statusCode: 400 })
      expect(mockTransaction).not.toHaveBeenCalled()
    })

    test('409 when the username is taken, including a race (P2002 on username)', async () => {
      mockUpdateUser.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test', meta: { target: ['username'] } }))
      const event = makeEvent({ username: 'taken_name' })

      await expect((handler as unknown as (e: typeof event) => Promise<unknown>)(event)).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Username taken' })
      expect(logger.error).not.toHaveBeenCalled()
    })

    test('a bio is trimmed; blank or null clears it', async () => {
      expect(await update({ bio: '  Lifting since 2010  ' })).toEqual({ bio: 'Lifting since 2010' })
      mockUpdateUser.mockClear()
      expect(await update({ bio: '   ' })).toEqual({ bio: null })
      mockUpdateUser.mockClear()
      expect(await update({ bio: null })).toEqual({ bio: null })
    })

    test('the 100-character bio limit counts characters, not UTF-16 units (matches the DB CHECK)', async () => {
      expect(await update({ bio: '💪'.repeat(100) })).toEqual({ bio: '💪'.repeat(100) })
    })

    test.each([
      ['over 100 characters', { bio: 'x'.repeat(101) }],
      ['not a string', { bio: 7 }],
    ])('400 for a bio %s', async (_label, body) => {
      const event = makeEvent(body)
      await expect((handler as unknown as (e: typeof event) => Promise<unknown>)(event)).rejects.toMatchObject({ statusCode: 400 })
      expect(mockUpdateUser).not.toHaveBeenCalled()
    })

    test('username and bio can be sent with the other settings', async () => {
      expect(await update({ username: 'saul', bio: 'hi', profileVisibility: 'PUBLIC' }))
        .toEqual({ username: 'saul', bio: 'hi', profileVisibility: 'PUBLIC' })
    })
  })

  test('updates both fields together', async () => {
    mockUpdateUser.mockResolvedValueOnce(mockUpdatedUser)

    const event = makeEvent({ ptRoutineInWorkout: false, profileVisibility: 'PRIVATE' })
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockUpdateUser.mock.calls[0]![0].data).toEqual({ ptRoutineInWorkout: false, profileVisibility: 'PRIVATE' })
  })

  test('throws 404 when user record is missing', async () => {
    mockLockUser.mockResolvedValueOnce([])

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
    mockLockUser.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
