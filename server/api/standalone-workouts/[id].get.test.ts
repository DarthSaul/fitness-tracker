/**
 * Tests for server/api/standalone-workouts/[id].get.ts
 *
 * Coverage strategy:
 *  - Happy path: returns full workout with nested groups -> exercises -> sets
 *  - Validation: 400 when id param is missing or whitespace only
 *  - Not found: 404 when findUnique returns null
 *  - Error propagation: 500 when findUnique rejects (non-H3 error), logs via
 *    logger.error
 *  - H3 error pass-through: re-throws an H3 error without wrapping it as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].get'

const mockFindUnique = (prisma as typeof prisma).standaloneWorkout.findUnique as ReturnType<typeof vi.fn>
const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id = 'sw001') {
  mockGetRouterParam.mockReturnValue(id)
  return { path: `/api/standalone-workouts/${id}`, context: {} }
}

const mockWorkout = {
  id: 'sw001',
  category: 'Upper Push',
  order: 1,
  name: 'Push Day',
  description: 'Chest, shoulders, triceps',
  createdAt: new Date(),
  groups: [
    {
      id: 'swg001',
      order: 1,
      label: null,
      exercises: [
        {
          id: 'swe001',
          order: 1,
          exercise: { id: 'ex001', name: 'Bench Press' },
          sets: [{ id: 'sws001', setNumber: 1, reps: 8, weight: 60, rpe: null, notes: null }],
        },
      ],
    },
  ],
}

describe('GET /api/standalone-workouts/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('returns full workout detail when found', async () => {
    mockFindUnique.mockResolvedValueOnce(mockWorkout)

    const event = makeEvent('sw001')
    const result = await (handler as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockWorkout)
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'sw001' },
      include: {
        groups: {
          orderBy: { order: 'asc' },
          include: {
            exercises: {
              orderBy: { order: 'asc' },
              include: {
                exercise: true,
                sets: { orderBy: { setNumber: 'asc' } },
              },
            },
          },
        },
      },
    })
  })

  test('throws 400 when id param is undefined', async () => {
    const event = makeEvent(undefined as unknown as string)
    mockGetRouterParam.mockReturnValue(undefined)

    await expect(
      (handler as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing workout ID' })
  })

  test('throws 400 when id param is whitespace only', async () => {
    mockGetRouterParam.mockReturnValue('   ')
    const event = makeEvent('   ')

    await expect(
      (handler as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing workout ID' })
  })

  test('throws 404 when workout not found', async () => {
    mockFindUnique.mockResolvedValueOnce(null)

    const event = makeEvent('sw999')
    await expect(
      (handler as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Workout not found' })
  })

  test('throws 500 and logs when findUnique rejects', async () => {
    const dbError = new Error('database timeout')
    mockFindUnique.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent('sw001')
    await expect(
      (handler as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch standalone workout' })

    expect(logger.error).toHaveBeenCalledWith(
      { err: dbError, route: 'GET /api/standalone-workouts/:id' },
      '[GET /api/standalone-workouts/:id] Failed to fetch standalone workout',
    )
    consoleSpy.mockRestore()
  })

  test('re-throws an H3 error without wrapping it as 500', async () => {
    const h3Error = new Error('Workout not found') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'Workout not found'
    mockFindUnique.mockRejectedValueOnce(h3Error)

    const event = makeEvent('sw999')
    const thrown = await (handler as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number; statusMessage: string }

    expect(thrown.statusCode).toBe(404)
    expect(thrown.statusMessage).toBe('Workout not found')
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
