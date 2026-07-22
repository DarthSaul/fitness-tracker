/**
 * Tests for server/api/pt-routines/[id].patch.ts
 *
 * Coverage strategy:
 *  - Happy paths: name-only (no exercise replacement), exercises-only
 *    (deleteMany + createMany with derived order), and both together
 *  - Validation: 400 for missing ID, non-object body, no recognized fields,
 *    and the full name/exercises field matrix (same rules as POST)
 *  - Not found / ownership: throws 404 when missing or owned by another user
 *  - Concurrency: maps P2002 to 409
 *  - Error propagation: throws 500 on unexpected error
 *  - H3 error pass-through: re-throws H3 errors without wrapping as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].patch'

const mockFindUnique = (prisma as typeof prisma).ptRoutine.findUnique as ReturnType<typeof vi.fn>
const mockUpdate = (prisma as typeof prisma).ptRoutine.update as ReturnType<typeof vi.fn>
const mockDeleteMany = (prisma as typeof prisma).ptRoutineExercise.deleteMany as ReturnType<typeof vi.fn>
const mockCreateMany = (prisma as typeof prisma).ptRoutineExercise.createMany as ReturnType<typeof vi.fn>
const mockTransaction = (prisma as typeof prisma).$transaction as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(body: unknown, id: string | undefined = 'rt001') {
  mockReadBody.mockResolvedValue(body)
  mockGetRouterParam.mockReturnValue(id)
  return {
    path: `/api/pt-routines/${id}`,
    context: { userId: 'user001' },
  }
}

const mockRoutine = {
  id: 'rt001',
  userId: 'user001',
  name: 'Knee Rehab',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockUpdatedRoutine = {
  ...mockRoutine,
  exercises: [
    { id: 'rtex001', ptRoutineId: 'rt001', order: 1, title: 'Clamshells', durationSeconds: null, reps: 15 },
  ],
}

describe('PATCH /api/pt-routines/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockTransaction.mockImplementation(async (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma))
    mockFindUnique.mockResolvedValue(mockRoutine)
    mockUpdate.mockResolvedValue(mockRoutine)
    mockDeleteMany.mockResolvedValue({ count: 0 })
    mockCreateMany.mockResolvedValue({ count: 1 })
  })

  test('updates name only without touching exercises', async () => {
    // Second findUnique returns the refreshed routine
    mockFindUnique.mockResolvedValueOnce(mockRoutine).mockResolvedValueOnce(mockUpdatedRoutine)

    const event = makeEvent({ name: 'Hip Rehab' })
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockUpdatedRoutine)
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'rt001' }, data: { name: 'Hip Rehab' } })
    expect(mockDeleteMany).not.toHaveBeenCalled()
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  test('replaces exercises with derived order without renaming', async () => {
    mockFindUnique.mockResolvedValueOnce(mockRoutine).mockResolvedValueOnce(mockUpdatedRoutine)

    const event = makeEvent({
      exercises: [
        { title: 'Bridges', reps: 12 },
        { title: 'Plank', durationSeconds: 60 },
      ],
    })
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockUpdatedRoutine)
    // The routine row is still touched so updatedAt reflects the exercise change
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'rt001' }, data: { updatedAt: expect.any(Date) } })
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { ptRoutineId: 'rt001' } })
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [
        { ptRoutineId: 'rt001', title: 'Bridges', durationSeconds: null, reps: 12, order: 1 },
        { ptRoutineId: 'rt001', title: 'Plank', durationSeconds: 60, reps: null, order: 2 },
      ],
    })
  })

  test('updates name and replaces exercises together', async () => {
    mockFindUnique.mockResolvedValueOnce(mockRoutine).mockResolvedValueOnce(mockUpdatedRoutine)

    const event = makeEvent({ name: 'Hip Rehab', exercises: [{ title: 'Bridges', reps: 12 }] })
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'rt001' }, data: { name: 'Hip Rehab' } })
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { ptRoutineId: 'rt001' } })
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [{ ptRoutineId: 'rt001', title: 'Bridges', durationSeconds: null, reps: 12, order: 1 }],
    })
  })

  test('throws 400 when routine ID is missing', async () => {
    const event = makeEvent({ name: 'Hip Rehab' })
    mockGetRouterParam.mockReturnValue(undefined)
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing routine ID' })
  })

  test.each([
    ['body is an array', ['nope'], 'Invalid request body'],
    ['body is a string', 'nope', 'Invalid request body'],
    ['no recognized fields', {}, 'At least one of name or exercises must be provided'],
    ['body is null', null, 'At least one of name or exercises must be provided'],
    ['name is blank', { name: '  ' }, 'name must be a non-empty string'],
    ['name is not a string', { name: 42 }, 'name must be a non-empty string'],
    ['name is too long', { name: 'x'.repeat(101) }, 'name must be 100 characters or less'],
    ['exercises is not an array', { exercises: 'nope' }, 'exercises must be a non-empty array'],
    ['exercises is empty', { exercises: [] }, 'exercises must be a non-empty array'],
    ['exercises exceeds 50 entries', { exercises: Array.from({ length: 51 }, () => ({ title: 'x', reps: 1 })) }, 'exercises must contain 50 or fewer entries'],
    ['exercise is not an object', { exercises: ['nope'] }, 'Each exercise must be an object'],
    ['exercise title is blank', { exercises: [{ title: '  ', reps: 15 }] }, 'Each exercise must have a non-empty title'],
    ['exercise title is too long', { exercises: [{ title: 'x'.repeat(101), reps: 15 }] }, 'Exercise titles must be 100 characters or less'],
    ['both measures set', { exercises: [{ title: 'Clamshells', reps: 15, durationSeconds: 90 }] }, 'Each exercise must have exactly one of durationSeconds or reps'],
    ['neither measure set', { exercises: [{ title: 'Clamshells' }] }, 'Each exercise must have exactly one of durationSeconds or reps'],
    ['durationSeconds out of bounds', { exercises: [{ title: 'Wall sit', durationSeconds: 3601 }] }, 'durationSeconds must be an integer between 1 and 3600'],
    ['reps out of bounds', { exercises: [{ title: 'Clamshells', reps: 0 }] }, 'reps must be an integer between 1 and 1000'],
  ])('throws 400 when %s', async (_label, body, statusMessage) => {
    const event = makeEvent(body)
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test('throws 404 when routine does not exist', async () => {
    mockFindUnique.mockResolvedValueOnce(null)

    const event = makeEvent({ name: 'Hip Rehab' })
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Routine not found' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test('throws 404 when routine belongs to another user', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...mockRoutine, userId: 'user999' })

    const event = makeEvent({ name: 'Hip Rehab' })
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Routine not found' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test('throws 409 when the replacement races a concurrent save (P2002)', async () => {
    const prismaError = new Error('Unique constraint failed') as Error & { code: string }
    prismaError.code = 'P2002'
    mockCreateMany.mockRejectedValueOnce(prismaError)

    const event = makeEvent({ exercises: [{ title: 'Bridges', reps: 12 }] })
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Routine was updated concurrently — retry' })
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockFindUnique.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent({ name: 'Hip Rehab' })
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to update routine' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'PATCH /api/pt-routines/:id' }, '[PATCH /api/pt-routines/:id] Failed to update routine')
    consoleSpy.mockRestore()
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('Routine not found') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'Routine not found'
    mockFindUnique.mockRejectedValueOnce(h3Error)

    const event = makeEvent({ name: 'Hip Rehab' })
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
