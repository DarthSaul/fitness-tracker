import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './complete.patch'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockFindUniqueSession = (prisma as typeof prisma).workoutSession.findUnique as ReturnType<typeof vi.fn>
const mockUpdateSession = (prisma as typeof prisma).workoutSession.update as ReturnType<typeof vi.fn>
const mockUpdateUserProgram = (prisma as typeof prisma).userProgram.update as ReturnType<typeof vi.fn>
const mockTransaction = (prisma as typeof prisma).$transaction as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id = 'ws001') {
  mockGetRouterParam.mockReturnValue(id)
  return {
    path: `/api/workouts/${id}/complete`,
    context: { userId: 'user001' },
  }
}

function makeSession(weekNumber: number, dayNumber: number, weeks: Array<{ weekNumber: number; dayNumbers: number[] }>) {
  return {
    id: 'ws001',
    userId: 'user001',
    userProgramId: 'up001',
    weekNumber,
    dayNumber,
    status: 'IN_PROGRESS',
    userProgram: {
      id: 'up001',
      programId: 'prog001',
      currentWeek: weekNumber,
      currentDay: dayNumber,
      program: {
        weeks: weeks.map((w) => ({
          weekNumber: w.weekNumber,
          days: w.dayNumbers.map((dn) => ({
            id: `d${w.weekNumber}-${dn}`,
            dayNumber: dn,
          })),
        })),
      },
    },
  }
}

describe('PATCH /api/workouts/:id/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(readBody as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockTransaction.mockImplementation((promises: Promise<unknown>[]) => Promise.all(promises))
  })

  test('advances to next day within the same week', async () => {
    // Week 1, day 1 of 3 days → should advance to day 2
    const session = makeSession(1, 1, [{ weekNumber: 1, dayNumbers: [1, 2, 3] }, { weekNumber: 2, dayNumbers: [1, 2] }])
    mockFindUniqueSession.mockResolvedValueOnce(session)

    const updatedSession = { ...session, status: 'COMPLETED', completedAt: new Date() }
    const updatedProgram = { id: 'up001', currentWeek: 1, currentDay: 2, isActive: true }
    mockUpdateSession.mockResolvedValueOnce(updatedSession)
    mockUpdateUserProgram.mockResolvedValueOnce(updatedProgram)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ session: unknown; userProgram: unknown; programCompleted: boolean }>)(event)

    expect(result.programCompleted).toBe(false)
    expect(result.session).toEqual(updatedSession)
    expect(result.userProgram).toEqual(updatedProgram)
    expect(mockUpdateUserProgram).toHaveBeenCalledWith({
      where: { id: 'up001' },
      data: { currentWeek: 1, currentDay: 2 },
    })
  })

  test('advances to next week when last day of week', async () => {
    // Week 1, day 3 of 3 days, 2 weeks total → should advance to week 2, day 1
    const session = makeSession(1, 3, [{ weekNumber: 1, dayNumbers: [1, 2, 3] }, { weekNumber: 2, dayNumbers: [1, 2] }])
    mockFindUniqueSession.mockResolvedValueOnce(session)

    const updatedSession = { ...session, status: 'COMPLETED' }
    const updatedProgram = { id: 'up001', currentWeek: 2, currentDay: 1, isActive: true }
    mockUpdateSession.mockResolvedValueOnce(updatedSession)
    mockUpdateUserProgram.mockResolvedValueOnce(updatedProgram)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ programCompleted: boolean }>)(event)

    expect(result.programCompleted).toBe(false)
    expect(mockUpdateUserProgram).toHaveBeenCalledWith({
      where: { id: 'up001' },
      data: { currentWeek: 2, currentDay: 1 },
    })
  })

  test('completes program and deactivates when last day of last week', async () => {
    // Week 2, day 2 of 2 days, 2 weeks total → program complete
    const session = makeSession(2, 2, [{ weekNumber: 1, dayNumbers: [1, 2, 3] }, { weekNumber: 2, dayNumbers: [1, 2] }])
    mockFindUniqueSession.mockResolvedValueOnce(session)

    const updatedSession = { ...session, status: 'COMPLETED' }
    const updatedProgram = { id: 'up001', isActive: false }
    mockUpdateSession.mockResolvedValueOnce(updatedSession)
    mockUpdateUserProgram.mockResolvedValueOnce(updatedProgram)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ programCompleted: boolean }>)(event)

    expect(result.programCompleted).toBe(true)
    expect(mockUpdateUserProgram).toHaveBeenCalledWith({
      where: { id: 'up001' },
      data: { isActive: false },
    })
  })

  test('advances to next day with non-contiguous day numbers', async () => {
    // Week 1 has days [1, 3] (gap at 2), currently on day 1 → should advance to day 3
    const session = makeSession(1, 1, [{ weekNumber: 1, dayNumbers: [1, 3] }])
    mockFindUniqueSession.mockResolvedValueOnce(session)

    const updatedSession = { ...session, status: 'COMPLETED', completedAt: new Date() }
    const updatedProgram = { id: 'up001', currentWeek: 1, currentDay: 3, isActive: true }
    mockUpdateSession.mockResolvedValueOnce(updatedSession)
    mockUpdateUserProgram.mockResolvedValueOnce(updatedProgram)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ programCompleted: boolean }>)(event)

    expect(result.programCompleted).toBe(false)
    expect(mockUpdateUserProgram).toHaveBeenCalledWith({
      where: { id: 'up001' },
      data: { currentWeek: 1, currentDay: 3 },
    })
  })

  test('skips empty weeks when advancing', async () => {
    // Week 1 day 1, then week 2 is empty, week 3 has day 1 → should advance to week 3 day 1
    const session = makeSession(1, 1, [
      { weekNumber: 1, dayNumbers: [1] },
      { weekNumber: 2, dayNumbers: [] },
      { weekNumber: 3, dayNumbers: [1] },
    ])
    mockFindUniqueSession.mockResolvedValueOnce(session)

    const updatedSession = { ...session, status: 'COMPLETED', completedAt: new Date() }
    const updatedProgram = { id: 'up001', currentWeek: 3, currentDay: 1, isActive: true }
    mockUpdateSession.mockResolvedValueOnce(updatedSession)
    mockUpdateUserProgram.mockResolvedValueOnce(updatedProgram)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ programCompleted: boolean }>)(event)

    expect(result.programCompleted).toBe(false)
    expect(mockUpdateUserProgram).toHaveBeenCalledWith({
      where: { id: 'up001' },
      data: { currentWeek: 3, currentDay: 1 },
    })
  })

  test('completes program when all remaining weeks are empty', async () => {
    // Week 1 day 1, then weeks 2 and 3 are empty → program complete
    const session = makeSession(1, 1, [
      { weekNumber: 1, dayNumbers: [1] },
      { weekNumber: 2, dayNumbers: [] },
      { weekNumber: 3, dayNumbers: [] },
    ])
    mockFindUniqueSession.mockResolvedValueOnce(session)

    const updatedSession = { ...session, status: 'COMPLETED', completedAt: new Date() }
    const updatedProgram = { id: 'up001', isActive: false }
    mockUpdateSession.mockResolvedValueOnce(updatedSession)
    mockUpdateUserProgram.mockResolvedValueOnce(updatedProgram)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ programCompleted: boolean }>)(event)

    expect(result.programCompleted).toBe(true)
    expect(mockUpdateUserProgram).toHaveBeenCalledWith({
      where: { id: 'up001' },
      data: { isActive: false },
    })
  })

  test('throws 500 when session weekNumber not found in program weeks', async () => {
    // Week 99 doesn't exist in the program
    const session = makeSession(99, 1, [{ weekNumber: 1, dayNumbers: [1, 2, 3] }])
    mockFindUniqueSession.mockResolvedValueOnce(session)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: expect.stringContaining('Invalid program position') })
  })

  test('throws 500 when session dayNumber not found in current week', async () => {
    // Day 99 doesn't exist in week 1
    const session = makeSession(1, 99, [{ weekNumber: 1, dayNumbers: [1, 2, 3] }])
    mockFindUniqueSession.mockResolvedValueOnce(session)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: expect.stringContaining('Invalid program position') })
  })

  test('throws 400 when session id is missing', async () => {
    const event = makeEvent(undefined as unknown as string)
    mockGetRouterParam.mockReturnValue(undefined)

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test('throws 404 when session not found', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(null)

    const event = makeEvent('ws999')
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Session not found' })
  })

  test('throws 403 when session belongs to another user', async () => {
    const session = makeSession(1, 1, [{ weekNumber: 1, dayNumbers: [1, 2, 3] }])
    mockFindUniqueSession.mockResolvedValueOnce({ ...session, userId: 'other-user' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Not Found' })
  })

  test('throws 409 when session is already completed', async () => {
    const session = makeSession(1, 1, [{ weekNumber: 1, dayNumbers: [1, 2, 3] }])
    mockFindUniqueSession.mockResolvedValueOnce({ ...session, status: 'COMPLETED' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Session already completed' })
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockFindUniqueSession.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to complete workout' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[PATCH /api/workouts/:id/complete] Failed to complete workout',
      dbError,
    )
    consoleSpy.mockRestore()
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('Session not found') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'Session not found'
    mockFindUniqueSession.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })

  test('uses $transaction for atomic update', async () => {
    const session = makeSession(1, 1, [{ weekNumber: 1, dayNumbers: [1, 2, 3] }])
    mockFindUniqueSession.mockResolvedValueOnce(session)
    mockUpdateSession.mockResolvedValueOnce({ ...session, status: 'COMPLETED' })
    mockUpdateUserProgram.mockResolvedValueOnce({ id: 'up001', currentWeek: 1, currentDay: 2 })

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockTransaction).toHaveBeenCalledOnce()
  })
})
