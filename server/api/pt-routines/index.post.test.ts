/**
 * Tests for server/api/pt-routines/index.post.ts
 *
 * Coverage strategy:
 *  - Happy path: creates routine + exercises with derived order, returns 201
 *  - Validation 400 matrix: name missing/blank/too long; exercises missing/
 *    not-array/empty/over cap; per-exercise title blank/too long; both
 *    measures set; neither measure set; non-integer/out-of-bounds values
 *  - Routine cap: throws 400 when the user already has 50 routines
 *  - Error propagation: throws 500 on unexpected error
 *  - H3 error pass-through: re-throws H3 errors without wrapping as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.post'

const mockCount = (prisma as typeof prisma).ptRoutine.count as ReturnType<typeof vi.fn>
const mockRoutineCreate = (prisma as typeof prisma).ptRoutine.create as ReturnType<typeof vi.fn>
const mockRoutineFindUnique = (prisma as typeof prisma).ptRoutine.findUnique as ReturnType<typeof vi.fn>
const mockExerciseCreateMany = (prisma as typeof prisma).ptRoutineExercise.createMany as ReturnType<typeof vi.fn>
const mockTransaction = (prisma as typeof prisma).$transaction as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

const validBody = {
  name: 'Knee Rehab',
  exercises: [
    { title: 'Clamshells', reps: 15 },
    { title: 'Wall sit', durationSeconds: 90 },
  ],
}

function makeEvent(body: unknown = validBody) {
  mockReadBody.mockResolvedValue(body)
  return {
    path: '/api/pt-routines',
    context: { userId: 'user001' },
    node: { res: { statusCode: 200 } },
  }
}

const mockCreatedRoutine = {
  id: 'rt001',
  userId: 'user001',
  name: 'Knee Rehab',
  createdAt: new Date(),
  updatedAt: new Date(),
  exercises: [
    { id: 'rtex001', ptRoutineId: 'rt001', order: 1, title: 'Clamshells', durationSeconds: null, reps: 15 },
    { id: 'rtex002', ptRoutineId: 'rt001', order: 2, title: 'Wall sit', durationSeconds: 90, reps: null },
  ],
}

describe('POST /api/pt-routines', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockCount.mockResolvedValue(0)
    mockTransaction.mockImplementation(async (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma))
  })

  test('creates routine with derived exercise order and returns 201', async () => {
    mockRoutineCreate.mockResolvedValueOnce({ id: 'rt001', userId: 'user001', name: 'Knee Rehab' })
    mockExerciseCreateMany.mockResolvedValueOnce({ count: 2 })
    mockRoutineFindUnique.mockResolvedValueOnce(mockCreatedRoutine)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockCreatedRoutine)
    expect(event.node.res.statusCode).toBe(201)
    expect(mockRoutineCreate).toHaveBeenCalledWith({
      data: { userId: 'user001', name: 'Knee Rehab' },
    })
    expect(mockExerciseCreateMany).toHaveBeenCalledWith({
      data: [
        { ptRoutineId: 'rt001', title: 'Clamshells', durationSeconds: null, reps: 15, order: 1 },
        { ptRoutineId: 'rt001', title: 'Wall sit', durationSeconds: 90, reps: null, order: 2 },
      ],
    })
    expect(mockRoutineFindUnique).toHaveBeenCalledWith({
      where: { id: 'rt001' },
      include: { exercises: { orderBy: { order: 'asc' } } },
    })
  })

  test('trims name and titles before saving', async () => {
    mockRoutineCreate.mockResolvedValueOnce({ id: 'rt001' })
    mockExerciseCreateMany.mockResolvedValueOnce({ count: 1 })
    mockRoutineFindUnique.mockResolvedValueOnce(mockCreatedRoutine)

    const event = makeEvent({ name: '  Knee Rehab  ', exercises: [{ title: '  Clamshells  ', reps: 15 }] })
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockRoutineCreate).toHaveBeenCalledWith({ data: { userId: 'user001', name: 'Knee Rehab' } })
    expect(mockExerciseCreateMany).toHaveBeenCalledWith({
      data: [{ ptRoutineId: 'rt001', title: 'Clamshells', durationSeconds: null, reps: 15, order: 1 }],
    })
  })

  test.each([
    ['body is null', null, 'name must be a non-empty string'],
    ['name is missing', { exercises: validBody.exercises }, 'name must be a non-empty string'],
    ['name is blank', { ...validBody, name: '   ' }, 'name must be a non-empty string'],
    ['name is not a string', { ...validBody, name: 42 }, 'name must be a non-empty string'],
    ['name is too long', { ...validBody, name: 'x'.repeat(101) }, 'name must be 100 characters or less'],
    ['exercises is missing', { name: 'Knee Rehab' }, 'exercises must be a non-empty array'],
    ['exercises is not an array', { name: 'Knee Rehab', exercises: 'nope' }, 'exercises must be a non-empty array'],
    ['exercises is empty', { name: 'Knee Rehab', exercises: [] }, 'exercises must be a non-empty array'],
    ['exercises exceeds 50 entries', { name: 'Knee Rehab', exercises: Array.from({ length: 51 }, () => ({ title: 'x', reps: 1 })) }, 'exercises must contain 50 or fewer entries'],
    ['exercise is not an object', { name: 'Knee Rehab', exercises: ['nope'] }, 'Each exercise must be an object'],
    ['exercise title is missing', { name: 'Knee Rehab', exercises: [{ reps: 15 }] }, 'Each exercise must have a non-empty title'],
    ['exercise title is blank', { name: 'Knee Rehab', exercises: [{ title: '  ', reps: 15 }] }, 'Each exercise must have a non-empty title'],
    ['exercise title is too long', { name: 'Knee Rehab', exercises: [{ title: 'x'.repeat(101), reps: 15 }] }, 'Exercise titles must be 100 characters or less'],
    ['both measures set', { name: 'Knee Rehab', exercises: [{ title: 'Clamshells', reps: 15, durationSeconds: 90 }] }, 'Each exercise must have exactly one of durationSeconds or reps'],
    ['neither measure set', { name: 'Knee Rehab', exercises: [{ title: 'Clamshells' }] }, 'Each exercise must have exactly one of durationSeconds or reps'],
    ['both measures null', { name: 'Knee Rehab', exercises: [{ title: 'Clamshells', reps: null, durationSeconds: null }] }, 'Each exercise must have exactly one of durationSeconds or reps'],
    ['durationSeconds is not an integer', { name: 'Knee Rehab', exercises: [{ title: 'Wall sit', durationSeconds: 1.5 }] }, 'durationSeconds must be an integer between 1 and 3600'],
    ['durationSeconds is zero', { name: 'Knee Rehab', exercises: [{ title: 'Wall sit', durationSeconds: 0 }] }, 'durationSeconds must be an integer between 1 and 3600'],
    ['durationSeconds exceeds 3600', { name: 'Knee Rehab', exercises: [{ title: 'Wall sit', durationSeconds: 3601 }] }, 'durationSeconds must be an integer between 1 and 3600'],
    ['reps is not an integer', { name: 'Knee Rehab', exercises: [{ title: 'Clamshells', reps: '15' }] }, 'reps must be an integer between 1 and 1000'],
    ['reps is negative', { name: 'Knee Rehab', exercises: [{ title: 'Clamshells', reps: -1 }] }, 'reps must be an integer between 1 and 1000'],
    ['reps exceeds 1000', { name: 'Knee Rehab', exercises: [{ title: 'Clamshells', reps: 1001 }] }, 'reps must be an integer between 1 and 1000'],
  ])('throws 400 when %s', async (_label, body, statusMessage) => {
    const event = makeEvent(body)
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage })
    expect(mockRoutineCreate).not.toHaveBeenCalled()
  })

  test('throws 400 when the user already has 50 routines', async () => {
    mockCount.mockResolvedValueOnce(50)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Routine limit reached (50)' })
    expect(mockRoutineCreate).not.toHaveBeenCalled()
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockCount.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to create routine' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'POST /api/pt-routines' }, '[POST /api/pt-routines] Failed to create routine')
    consoleSpy.mockRestore()
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('nope') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'nope'
    mockCount.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
