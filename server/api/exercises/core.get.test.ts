import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './core.get'

const mockFindManyExercise = (prisma as typeof prisma).exercise.findMany as ReturnType<typeof vi.fn>

function makeEvent() {
  return {
    path: '/api/exercises/core',
    context: { userId: 'user001' },
  }
}

const mockCoreExercises = [
  { id: 'ex101', name: 'Crunches', description: null },
  { id: 'ex102', name: 'Leg Raises', description: null },
  { id: 'ex103', name: 'Plank', description: 'Isometric hold' },
]

describe('GET /api/exercises/core', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns core exercises sorted by name', async () => {
    mockFindManyExercise.mockResolvedValueOnce(mockCoreExercises)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<typeof mockCoreExercises>)(event)

    expect(result).toEqual(mockCoreExercises)
    expect(mockFindManyExercise).toHaveBeenCalledWith({
      where: { isCore: true },
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' },
    })
  })

  test('returns empty array when no core exercises exist', async () => {
    mockFindManyExercise.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual([])
  })

  test('throws 500 on database error and logs it', async () => {
    const dbError = new Error('connection reset')
    mockFindManyExercise.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch core exercises' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'GET /api/exercises/core' }, '[GET /api/exercises/core] Failed to fetch core exercises')
    consoleSpy.mockRestore()
  })
})
