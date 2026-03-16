/**
 * Tests for server/api/programs/days/[id].get.ts
 *
 * Coverage strategy:
 *  - Happy path: returns full day object when found
 *  - Not found: throws 404 when findUnique returns null
 *  - Error propagation: throws 500 when findUnique rejects (non-H3 error)
 *  - H3 error pass-through: re-throws a 404 H3Error without wrapping it as 500
 *  - Missing/empty ID: throws 400
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].get'

const mockFindUnique = (prisma as typeof prisma).programDay.findUnique as ReturnType<typeof vi.fn>
const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id = 'clday001') {
  mockGetRouterParam.mockReturnValue(id)
  return { path: `/api/programs/days/${id}`, context: {} }
}

const mockFullDay = {
  id: 'clday001',
  programWeekId: 'clweek001',
  dayNumber: 1,
  name: 'Lower Body',
  warmUp: null,
  exerciseGroups: [
    {
      id: 'clgrp001',
      programDayId: 'clday001',
      order: 1,
      type: 'STANDARD',
      restSeconds: 90,
      exercises: [
        {
          id: 'clexe001',
          exerciseGroupId: 'clgrp001',
          exerciseId: 'clexr001',
          order: 1,
          exercise: {
            id: 'clexr001',
            name: 'Back Squat',
            description: null,
          },
          sets: [
            {
              id: 'clset001',
              programExerciseId: 'clexe001',
              setNumber: 1,
              reps: 5,
              weight: 135,
              rpe: null,
              notes: null,
            },
          ],
        },
      ],
    },
  ],
}

describe('GET /api/programs/days/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('returns full day object when found', async () => {
    mockFindUnique.mockResolvedValueOnce(mockFullDay)

    const event = makeEvent('clday001')
    const result = await (handler as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockFullDay)
    expect(mockFindUnique).toHaveBeenCalledOnce()
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'clday001' },
      include: {
        exerciseGroups: {
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

  test('throws 404 when findUnique returns null', async () => {
    mockFindUnique.mockResolvedValueOnce(null)

    const event = makeEvent('clday999')
    await expect(
      (handler as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Day not found' })

    expect(mockCreateError).toHaveBeenCalledWith({
      statusCode: 404,
      statusMessage: 'Day not found',
    })
  })

  test('throws 500 and logs when findUnique rejects with a non-H3 error', async () => {
    const dbError = new Error('database timeout')
    mockFindUnique.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent('clday001')
    await expect(
      (handler as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch day' })

    expect(mockCreateError).toHaveBeenCalledWith({
      statusCode: 500,
      statusMessage: 'Failed to fetch day',
    })
    expect(consoleSpy).toHaveBeenCalledWith(
      '[GET /api/programs/days/:id] Failed to fetch day',
      dbError,
    )
    consoleSpy.mockRestore()
  })

  test('throws 400 when id param is undefined', async () => {
    const event = makeEvent(undefined as unknown as string)
    mockGetRouterParam.mockReturnValue(undefined)
    await expect(
      (handler as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing day ID' })

    expect(mockCreateError).toHaveBeenCalledWith({
      statusCode: 400,
      statusMessage: 'Missing day ID',
    })
  })

  test('throws 400 when id param is empty string', async () => {
    const event = makeEvent('')
    mockGetRouterParam.mockReturnValue('  ')
    await expect(
      (handler as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing day ID' })

    expect(mockCreateError).toHaveBeenCalledWith({
      statusCode: 400,
      statusMessage: 'Missing day ID',
    })
  })

  test('re-throws an H3 error without wrapping it as 500', async () => {
    const h3Error = new Error('Day not found') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'Day not found'
    mockFindUnique.mockRejectedValueOnce(h3Error)

    const event = makeEvent('clday999')
    const thrown = await (handler as (e: typeof event) => Promise<unknown>)(event).catch((e) => e)

    expect(thrown.statusCode).toBe(404)
    expect(thrown.statusMessage).toBe('Day not found')
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
