/**
 * Tests for server/api/pt-routines/index.get.ts
 *
 * Coverage strategy:
 *  - Happy path: returns the user's routines with ordered exercises
 *  - Error propagation: throws 500 on unexpected error
 *  - H3 error pass-through: re-throws H3 errors without wrapping as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.get'

const mockFindMany = (prisma as typeof prisma).ptRoutine.findMany as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent() {
  return {
    path: '/api/pt-routines',
    context: { userId: 'user001' },
  }
}

const mockRoutines = [
  {
    id: 'rt001',
    userId: 'user001',
    name: 'Knee Rehab',
    createdAt: new Date(),
    updatedAt: new Date(),
    exercises: [
      { id: 'rtex001', ptRoutineId: 'rt001', order: 1, title: 'Clamshells', durationSeconds: null, reps: 15 },
      { id: 'rtex002', ptRoutineId: 'rt001', order: 2, title: 'Wall sit', durationSeconds: 90, reps: null },
    ],
  },
]

describe('GET /api/pt-routines', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('returns the user routines with ordered exercises', async () => {
    mockFindMany.mockResolvedValueOnce(mockRoutines)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockRoutines)
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user001' },
      include: { exercises: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    })
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockFindMany.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch routines' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'GET /api/pt-routines' }, '[GET /api/pt-routines] Failed to fetch routines')
    consoleSpy.mockRestore()
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('nope') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'nope'
    mockFindMany.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
