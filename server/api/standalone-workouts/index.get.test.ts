/**
 * Tests for server/api/standalone-workouts/index.get.ts
 *
 * Coverage strategy:
 *  - Happy path: returns array of standalone workouts, no category filter
 *  - Category filter: applies where clause when category is a valid string
 *  - Validation: 400 on empty-string category, whitespace category, non-string
 *    (array) category from a repeated query param
 *  - Error propagation: throws 500 when findMany rejects (non-H3 error), logs
 *    via logger.error
 *  - H3 error pass-through: re-throws an H3 error from findMany without
 *    wrapping it as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.get'

const mockFindMany = (prisma as typeof prisma).standaloneWorkout.findMany as ReturnType<typeof vi.fn>
const mockGetQuery = getQuery as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent() {
  return { path: '/api/standalone-workouts', context: {} }
}

const mockWorkouts = [
  {
    id: 'sw001',
    category: 'Upper Push',
    order: 1,
    name: 'Push Day',
    description: 'Chest, shoulders, triceps',
    createdAt: new Date(),
    _count: { groups: 3 },
  },
  {
    id: 'sw002',
    category: 'Upper Pull',
    order: 1,
    name: 'Pull Day',
    description: null,
    createdAt: new Date(),
    _count: { groups: 2 },
  },
]

describe('GET /api/standalone-workouts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetQuery.mockReturnValue({})
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('returns array of standalone workouts with no category filter', async () => {
    mockFindMany.mockResolvedValueOnce(mockWorkouts)

    const event = makeEvent()
    const result = await (handler as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockWorkouts)
    expect(mockFindMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: [{ category: 'asc' }, { order: 'asc' }],
      select: {
        id: true,
        category: true,
        order: true,
        name: true,
        description: true,
        createdAt: true,
        _count: { select: { groups: true } },
      },
    })
  })

  test('applies category filter when a valid category is provided', async () => {
    mockGetQuery.mockReturnValue({ category: 'Upper Push' })
    mockFindMany.mockResolvedValueOnce([mockWorkouts[0]])

    const event = makeEvent()
    await (handler as (e: typeof event) => Promise<unknown>)(event)

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { category: 'Upper Push' } }),
    )
  })

  test('returns empty array when no standalone workouts exist', async () => {
    mockFindMany.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual([])
  })

  test('throws 400 when category is an empty string', async () => {
    mockGetQuery.mockReturnValue({ category: '' })

    const event = makeEvent()
    await expect(
      (handler as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid category' })
  })

  test('throws 400 when category is whitespace only', async () => {
    mockGetQuery.mockReturnValue({ category: '   ' })

    const event = makeEvent()
    await expect(
      (handler as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid category' })
  })

  test('throws 400 when category is not a string (repeated query param)', async () => {
    mockGetQuery.mockReturnValue({ category: ['a', 'b'] })

    const event = makeEvent()
    await expect(
      (handler as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Invalid category' })
  })

  test('throws 500 and logs when findMany rejects', async () => {
    const dbError = new Error('database connection lost')
    mockFindMany.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch standalone workouts' })

    expect(logger.error).toHaveBeenCalledWith(
      { err: dbError, route: 'GET /api/standalone-workouts' },
      '[GET /api/standalone-workouts] Failed to fetch standalone workouts',
    )
    consoleSpy.mockRestore()
  })

  test('re-throws an H3 error from findMany without wrapping it as 500', async () => {
    const h3Error = new Error('Forbidden') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 403
    h3Error.statusMessage = 'Forbidden'
    mockFindMany.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(403)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
