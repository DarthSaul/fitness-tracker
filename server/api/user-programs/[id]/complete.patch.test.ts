/**
 * Tests for server/api/user-programs/[id]/complete.patch.ts
 *
 * Coverage strategy:
 *  - Happy path: ends an active run early, and a paused one
 *  - Cleanup: deletes the run's unfinished sessions and scheduled workouts
 *  - Validation: throws 400 when id param is missing/empty
 *  - Not found: throws 404 when user program doesn't exist
 *  - Ownership: throws 404 when user program belongs to another user
 *  - Terminal run: throws 409 when the run is already completed or archived
 *  - Empty run: throws 409 when the run has no completed workouts
 *  - Error propagation: throws 500 on unexpected error
 *  - H3 error pass-through: re-throws H3 errors without wrapping as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './complete.patch'

const mockFindUnique = (prisma as typeof prisma).userProgram.findUnique as ReturnType<typeof vi.fn>
const mockUpdate = (prisma as typeof prisma).userProgram.update as ReturnType<typeof vi.fn>
const mockCountSessions = (prisma as typeof prisma).workoutSession.count as ReturnType<typeof vi.fn>
const mockDeleteManySessions = (prisma as typeof prisma).workoutSession.deleteMany as ReturnType<typeof vi.fn>
const mockDeleteManyScheduled = (prisma as typeof prisma).scheduledWorkout.deleteMany as ReturnType<typeof vi.fn>
const mockTransaction = (prisma as typeof prisma).$transaction as ReturnType<typeof vi.fn>
const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id = 'up001') {
  mockGetRouterParam.mockReturnValue(id)
  return { path: `/api/user-programs/${id}/complete`, context: { userId: 'user001' } }
}

const mockOpenRun = {
  id: 'up001',
  userId: 'user001',
  programId: 'prog001',
  isActive: true,
  currentWeek: 3,
  currentDay: 2,
  startedAt: new Date(),
  completedAt: null,
  archivedAt: null,
}

const mockCompletedRun = {
  ...mockOpenRun,
  isActive: false,
  completedAt: new Date(),
  program: { id: 'prog001', name: 'Brick House', description: 'A strength program' },
}

describe('PATCH /api/user-programs/:id/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockTransaction.mockImplementation((fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma))
  })

  test('ends an active run early and returns the completed run', async () => {
    mockFindUnique.mockResolvedValueOnce(mockOpenRun)
    mockCountSessions.mockResolvedValueOnce(5)
    mockUpdate.mockResolvedValueOnce(mockCompletedRun)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockCompletedRun)
    expect(mockCountSessions).toHaveBeenCalledWith({ where: { userProgramId: 'up001', status: 'COMPLETED' } })
    // Position is left where the user stopped — only the lifecycle fields change
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'up001' },
      data: { isActive: false, completedAt: expect.any(Date) },
      include: {
        program: { select: { id: true, name: true, description: true } },
      },
    })
  })

  test('ends a paused run early', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...mockOpenRun, isActive: false })
    mockCountSessions.mockResolvedValueOnce(1)
    mockUpdate.mockResolvedValueOnce(mockCompletedRun)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockCompletedRun)
    expect(mockUpdate).toHaveBeenCalledTimes(1)
  })

  test('deletes the run\'s unfinished sessions and scheduled workouts', async () => {
    mockFindUnique.mockResolvedValueOnce(mockOpenRun)
    mockCountSessions.mockResolvedValueOnce(5)
    mockUpdate.mockResolvedValueOnce(mockCompletedRun)

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    // Unfinished sessions would otherwise resurface as the resume banner
    expect(mockDeleteManySessions).toHaveBeenCalledWith({
      where: { userProgramId: 'up001', status: { not: 'COMPLETED' } },
    })
    expect(mockDeleteManyScheduled).toHaveBeenCalledWith({ where: { userProgramId: 'up001' } })
  })

  test('throws 400 when id param is undefined', async () => {
    const event = makeEvent(undefined as unknown as string)
    mockGetRouterParam.mockReturnValue(undefined)

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing user program ID' })
  })

  test('throws 400 when id param is empty string', async () => {
    const event = makeEvent('')
    mockGetRouterParam.mockReturnValue('  ')

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing user program ID' })
  })

  test('throws 404 when user program does not exist', async () => {
    mockFindUnique.mockResolvedValueOnce(null)

    const event = makeEvent('up999')
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User program not found' })
  })

  test('throws 404 when user program belongs to another user', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...mockOpenRun, userId: 'other-user' })

    const event = makeEvent('up001')
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User program not found' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test('throws 409 when the run is already completed', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...mockOpenRun, isActive: false, completedAt: new Date() })

    const event = makeEvent('up001')
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Program already completed' })
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockDeleteManySessions).not.toHaveBeenCalled()
  })

  test('throws 409 when the run is archived', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...mockOpenRun, isActive: false, archivedAt: new Date() })

    const event = makeEvent('up001')
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Program already completed' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test('throws 409 when the run has no completed workouts', async () => {
    mockFindUnique.mockResolvedValueOnce(mockOpenRun)
    mockCountSessions.mockResolvedValueOnce(0)

    const event = makeEvent('up001')
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'No completed workouts in this run' })
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockDeleteManySessions).not.toHaveBeenCalled()
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockFindUnique.mockRejectedValueOnce(dbError)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to complete program' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'PATCH /api/user-programs/:id/complete' }, '[PATCH /api/user-programs/:id/complete] Failed to complete program')
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('User program not found') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'User program not found'
    mockFindUnique.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
