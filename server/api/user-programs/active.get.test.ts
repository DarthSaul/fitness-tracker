import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './active.get'

const mockFindFirst = (prisma as typeof prisma).userProgram.findFirst as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent() {
  return { path: '/api/user-programs/active', context: { userId: 'user001' } }
}

const mockActiveProgram = {
  id: 'up001',
  userId: 'user001',
  programId: 'prog001',
  isActive: true,
  currentWeek: 1,
  currentDay: 1,
  startedAt: new Date(),
  program: {
    id: 'prog001',
    name: 'Brick House',
    description: 'A strength program',
    weeks: [
      {
        id: 'w1',
        weekNumber: 1,
        days: [
          {
            id: 'd1',
            dayNumber: 1,
            name: 'Day 1',
            warmUp: null,
            exerciseGroups: [
              {
                id: 'eg1',
                order: 1,
                type: 'STANDARD',
                restSeconds: 90,
                exercises: [
                  {
                    id: 'pe1',
                    order: 1,
                    exercise: { id: 'ex1', name: 'Squat' },
                    sets: [{ id: 'es1', setNumber: 1, reps: 5, weight: 100, rpe: null, notes: null }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
}

describe('GET /api/user-programs/active', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('returns the active program with full nested structure', async () => {
    mockFindFirst.mockResolvedValueOnce(mockActiveProgram)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockActiveProgram)
    expect(mockFindFirst).toHaveBeenCalledOnce()
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user001', isActive: true },
        include: expect.objectContaining({
          program: expect.objectContaining({
            include: expect.objectContaining({
              weeks: expect.any(Object),
            }),
          }),
        }),
      }),
    )
  })

  test('throws 404 when no active program exists', async () => {
    mockFindFirst.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'No active program found' })
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockFindFirst.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to get active program' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[GET /api/user-programs/active] Failed to get active program',
      dbError,
    )
    consoleSpy.mockRestore()
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('Unauthorized') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 401
    h3Error.statusMessage = 'Unauthorized'
    mockFindFirst.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(401)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
