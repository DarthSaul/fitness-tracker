/**
 * Tests for server/api/programs/[id].get.ts
 *
 * Coverage strategy:
 *  - Happy path: returns full program object when found
 *  - Not found: throws 404 when findUnique returns null
 *  - Error propagation: throws 500 when findUnique rejects (non-H3 error)
 *  - H3 error pass-through: re-throws a 404 H3Error without wrapping it as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].get'

const mockFindUnique = (prisma as typeof prisma).program.findUnique as ReturnType<typeof vi.fn>
const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id = 'clprog001') {
  mockGetRouterParam.mockReturnValue(id)
  return { path: `/api/programs/${id}`, context: {} }
}

const mockFullProgram = {
  id: 'clprog001',
  name: 'Brick House',
  description: 'A strength program',
  createdAt: new Date(),
  weeks: [
    {
      id: 'clweek001',
      programId: 'clprog001',
      weekNumber: 1,
      days: [
        {
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
                  name: 'Back Squat',
                  order: 1,
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
        },
      ],
    },
  ],
}

describe('GET /api/programs/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('returns full program object when found', async () => {
    mockFindUnique.mockResolvedValueOnce(mockFullProgram)

    const event = makeEvent('clprog001')
    const result = await (handler as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockFullProgram)
    expect(mockFindUnique).toHaveBeenCalledOnce()
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'clprog001' },
      include: {
        weeks: {
          orderBy: { weekNumber: 'asc' },
          include: {
            days: {
              orderBy: { dayNumber: 'asc' },
              include: {
                exerciseGroups: {
                  orderBy: { order: 'asc' },
                  include: {
                    exercises: {
                      orderBy: { order: 'asc' },
                      include: { sets: { orderBy: { setNumber: 'asc' } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })
  })

  test('throws 404 when findUnique returns null', async () => {
    mockFindUnique.mockResolvedValueOnce(null)

    const event = makeEvent('clprog999')
    await expect(
      (handler as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Program not found' })

    expect(mockCreateError).toHaveBeenCalledWith({
      statusCode: 404,
      statusMessage: 'Program not found',
    })
  })

  test('throws 500 and logs when findUnique rejects with a non-H3 error', async () => {
    const dbError = new Error('database timeout')
    mockFindUnique.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent('clprog001')
    await expect(
      (handler as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch program' })

    expect(mockCreateError).toHaveBeenCalledWith({
      statusCode: 500,
      statusMessage: 'Failed to fetch program',
    })
    expect(consoleSpy).toHaveBeenCalledWith(
      '[GET /api/programs/:id] Failed to fetch program',
      dbError,
    )
    consoleSpy.mockRestore()
  })

  test('throws 400 when id param is undefined', async () => {
    const event = makeEvent(undefined as unknown as string)
    mockGetRouterParam.mockReturnValue(undefined)
    await expect(
      (handler as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing program ID' })

    expect(mockCreateError).toHaveBeenCalledWith({
      statusCode: 400,
      statusMessage: 'Missing program ID',
    })
  })

  test('throws 400 when id param is empty string', async () => {
    const event = makeEvent('')
    mockGetRouterParam.mockReturnValue('  ')
    await expect(
      (handler as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing program ID' })

    expect(mockCreateError).toHaveBeenCalledWith({
      statusCode: 400,
      statusMessage: 'Missing program ID',
    })
  })

  test('re-throws an H3 error without wrapping it as 500', async () => {
    const h3Error = new Error('Program not found') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'Program not found'
    mockFindUnique.mockRejectedValueOnce(h3Error)

    const event = makeEvent('clprog999')
    const thrown = await (handler as (e: typeof event) => Promise<unknown>)(event).catch((e) => e)

    expect(thrown.statusCode).toBe(404)
    expect(thrown.statusMessage).toBe('Program not found')
    // createError should NOT have been called with 500
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
