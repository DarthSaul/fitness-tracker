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
const mockAcceptPending = (prisma as typeof prisma).follow.updateManyAndReturn as ReturnType<typeof vi.fn>

const meSelect = { id: true, email: true, name: true, avatarUrl: true, ptRoutineInWorkout: true, profileVisibility: true, username: true, bio: true, showActiveProgram: true, showWorkoutCount: true, weeklyWorkoutGoalEnabled: true, weeklyWorkoutGoal: true, weekStartDay: true }

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
  username: 'jane_doe',
  bio: null,
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
    mockAcceptPending.mockResolvedValue([])
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
    ['no recognised field', {}, 'Provide at least one of ptRoutineInWorkout, profileVisibility, username, bio, showActiveProgram, showWorkoutCount, weeklyWorkoutGoalEnabled, weeklyWorkoutGoal, weekStartDay'],
    ['body is null', null, 'Provide at least one of ptRoutineInWorkout, profileVisibility, username, bio, showActiveProgram, showWorkoutCount, weeklyWorkoutGoalEnabled, weeklyWorkoutGoal, weekStartDay'],
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
    expect(mockAcceptPending).not.toHaveBeenCalled()
  })

  test('going PRIVATE → PUBLIC accepts every pending request, in the same transaction as the update', async () => {
    mockUpdateUser.mockResolvedValueOnce({ ...mockUpdatedUser, profileVisibility: 'PUBLIC' })
    mockAcceptPending.mockResolvedValueOnce([{ id: 'f1', followerId: 'a' }])

    const event = makeEvent({ profileVisibility: 'PUBLIC' })
    const result = await (handler as unknown as (e: typeof event) => Promise<{ profileVisibility: string }>)(event)

    expect(mockTransaction).toHaveBeenCalledTimes(1)
    // One statement accepts the pending rows and returns exactly those it
    // changed, so a request cancelled concurrently can't be notified as accepted.
    expect(mockAcceptPending).toHaveBeenCalledWith({
      where: { followeeId: 'user001', status: 'PENDING' },
      data: { status: 'ACCEPTED', acceptedAt: expect.any(Date) },
      select: { id: true, followerId: true },
    })
    expect(mockUpdateUser.mock.invocationCallOrder[0]!).toBeLessThan(mockAcceptPending.mock.invocationCallOrder[0]!)
    expect(result.profileVisibility).toBe('PUBLIC')
  })

  test('going public: each accepted requester is told, the request notifications are retracted, pushes after commit', async () => {
    mockUpdateUser.mockResolvedValueOnce({ ...mockUpdatedUser, profileVisibility: 'PUBLIC' })
    mockAcceptPending.mockResolvedValueOnce([{ id: 'f1', followerId: 'ann' }, { id: 'f2', followerId: 'bob' }])
    ;(notifyEach as ReturnType<typeof vi.fn>).mockResolvedValueOnce(['follow_accepted:f1', 'follow_accepted:f2'])

    const event = makeEvent({ profileVisibility: 'PUBLIC' })
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(retract).toHaveBeenCalledWith(prisma, { followId: { in: ['f1', 'f2'] } })
    expect(notifyEach).toHaveBeenCalledWith(prisma, 'user001', [
      { recipientId: 'ann', type: 'FOLLOW_ACCEPTED', dedupeKey: 'follow_accepted:f1' },
      { recipientId: 'bob', type: 'FOLLOW_ACCEPTED', dedupeKey: 'follow_accepted:f2' },
    ])
    expect(pushAfterCommit).toHaveBeenCalledWith(event, ['follow_accepted:f1', 'follow_accepted:f2'])
  })

  test('going public with no pending requests: no notifications', async () => {
    mockUpdateUser.mockResolvedValueOnce({ ...mockUpdatedUser, profileVisibility: 'PUBLIC' })
    mockAcceptPending.mockResolvedValueOnce([])

    const event = makeEvent({ profileVisibility: 'PUBLIC' })
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(retract).not.toHaveBeenCalled()
    expect(notifyEach).not.toHaveBeenCalled()
  })

  test('staying PUBLIC does not touch follow requests', async () => {
    mockLockUser.mockResolvedValueOnce([{ profileVisibility: 'PUBLIC' }])
    mockUpdateUser.mockResolvedValueOnce({ ...mockUpdatedUser, profileVisibility: 'PUBLIC' })

    const event = makeEvent({ profileVisibility: 'PUBLIC' })
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockAcceptPending).not.toHaveBeenCalled()
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
    // Sends `body`, asserts the handler returns the updated profile (with
    // `returned` applied: the row as the database would hand it back), and
    // returns the data written, for the normalization assertions.
    const update = async (body: unknown, returned: Record<string, unknown> = {}) => {
      const row = { ...mockUpdatedUser, ...returned }
      mockUpdateUser.mockResolvedValueOnce(row)
      const event = makeEvent(body)
      const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)
      expect(result).toEqual(row)
      return mockUpdateUser.mock.calls[0]![0].data
    }

    test('a username is normalized before saving: "@SaulG" → "saulg"', async () => {
      expect(await update({ username: ' @SaulG ' }, { username: 'saulg' })).toEqual({ username: 'saulg' })
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
      expect(await update({ bio: '  Lifting since 2010  ' }, { bio: 'Lifting since 2010' })).toEqual({ bio: 'Lifting since 2010' })
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

    test('the two profile-stats settings take booleans, each on its own', async () => {
      expect(await update({ showActiveProgram: false })).toEqual({ showActiveProgram: false })
      mockUpdateUser.mockClear()
      expect(await update({ showWorkoutCount: true })).toEqual({ showWorkoutCount: true })
    })

    test.each([
      ['showActiveProgram', { showActiveProgram: 'no' }],
      ['showWorkoutCount', { showWorkoutCount: null }],
    ])('400 for a non-boolean %s, before any write', async (field, body) => {
      const event = makeEvent(body)
      await expect((handler as unknown as (e: typeof event) => Promise<unknown>)(event))
        .rejects.toMatchObject({ statusCode: 400, statusMessage: `${field} must be a boolean` })
      expect(mockTransaction).not.toHaveBeenCalled()
    })

    test('username and bio can be sent with the other settings', async () => {
      expect(await update({ username: 'saul', bio: 'hi', profileVisibility: 'PUBLIC' }, { username: 'saul', bio: 'hi', profileVisibility: 'PUBLIC' }))
        .toEqual({ username: 'saul', bio: 'hi', profileVisibility: 'PUBLIC' })
    })
  })

  describe('weekly workout goal', () => {
    // Sends `body` and returns the data written.
    const write = async (body: unknown) => {
      mockUpdateUser.mockResolvedValueOnce(mockUpdatedUser)
      const event = makeEvent(body)
      await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)
      return mockUpdateUser.mock.calls[0]![0].data
    }

    test('enable and set in one request', async () => {
      expect(await write({ weeklyWorkoutGoalEnabled: true, weeklyWorkoutGoal: 4 }))
        .toEqual({ weeklyWorkoutGoalEnabled: true, weeklyWorkoutGoal: 4 })
    })

    test('disabling (and "remove") writes only the toggle, so the number is kept', async () => {
      expect(await write({ weeklyWorkoutGoalEnabled: false })).toEqual({ weeklyWorkoutGoalEnabled: false })
    })

    test('the number can be updated on its own, enabled or not', async () => {
      expect(await write({ weeklyWorkoutGoal: 7 })).toEqual({ weeklyWorkoutGoal: 7 })
    })

    test('the week start can be changed on its own', async () => {
      expect(await write({ weekStartDay: 'MONDAY' })).toEqual({ weekStartDay: 'MONDAY' })
    })

    test('all three can be sent alongside the other settings', async () => {
      expect(await write({ weeklyWorkoutGoalEnabled: true, weeklyWorkoutGoal: 2, weekStartDay: 'SATURDAY', ptRoutineInWorkout: true }))
        .toEqual({ weeklyWorkoutGoalEnabled: true, weeklyWorkoutGoal: 2, weekStartDay: 'SATURDAY', ptRoutineInWorkout: true })
    })

    test.each([
      ['null goal', { weeklyWorkoutGoal: null }],
      ['goal of 0', { weeklyWorkoutGoal: 0 }],
      ['goal of 8', { weeklyWorkoutGoal: 8 }],
      ['fractional goal', { weeklyWorkoutGoal: 4.5 }],
      ['string goal', { weeklyWorkoutGoal: '4' }],
      ['non-boolean toggle', { weeklyWorkoutGoalEnabled: 'yes' }],
      ['lowercase week start', { weekStartDay: 'monday' }],
      ['unknown week start', { weekStartDay: 'FUNDAY' }],
      ['numeric week start', { weekStartDay: 1 }],
      ['valid toggle with an invalid goal', { weeklyWorkoutGoalEnabled: true, weeklyWorkoutGoal: 9 }],
    ])('400 for a %s, before any write', async (_label, body) => {
      const event = makeEvent(body)
      await expect((handler as unknown as (e: typeof event) => Promise<unknown>)(event)).rejects.toMatchObject({ statusCode: 400 })
      expect(mockTransaction).not.toHaveBeenCalled()
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
