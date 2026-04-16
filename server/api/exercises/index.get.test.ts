import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.get'

const mockGetQuery = getQuery as ReturnType<typeof vi.fn>
const mockFindManyExercise = (prisma as typeof prisma).exercise.findMany as ReturnType<typeof vi.fn>

function makeEvent() {
  return {
    path: '/api/exercises',
    context: { userId: 'user001' },
  }
}

const mockExercises = [
  { id: 'ex001', name: 'Bench Press', description: 'Horizontal push' },
  { id: 'ex002', name: 'Deadlift', description: null },
  { id: 'ex003', name: 'Squat', description: 'Compound lower body' },
]

describe('GET /api/exercises', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetQuery.mockReturnValue({})
  })

  test('returns all exercises sorted by name when no search param', async () => {
    mockFindManyExercise.mockResolvedValueOnce(mockExercises)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<typeof mockExercises>)(event)

    expect(result).toEqual(mockExercises)
    expect(mockFindManyExercise).toHaveBeenCalledWith({
      where: {},
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' },
    })
  })

  test('filters by search param with case-insensitive contains', async () => {
    mockGetQuery.mockReturnValue({ search: 'press' })
    mockFindManyExercise.mockResolvedValueOnce([mockExercises[0]])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<typeof mockExercises>)(event)

    expect(result).toEqual([mockExercises[0]])
    expect(mockFindManyExercise).toHaveBeenCalledWith({
      where: { name: { contains: 'press', mode: 'insensitive' } },
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' },
    })
  })

  test('returns empty array when no exercises match search', async () => {
    mockGetQuery.mockReturnValue({ search: 'nonexistent' })
    mockFindManyExercise.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<typeof mockExercises>)(event)

    expect(result).toEqual([])
  })

  test('ignores whitespace-only search param and returns all', async () => {
    mockGetQuery.mockReturnValue({ search: '   ' })
    mockFindManyExercise.mockResolvedValueOnce(mockExercises)

    const event = makeEvent()
    await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(mockFindManyExercise).toHaveBeenCalledWith({
      where: {},
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' },
    })
  })

  test('works without search param (undefined)', async () => {
    mockGetQuery.mockReturnValue({ search: undefined })
    mockFindManyExercise.mockResolvedValueOnce(mockExercises)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<typeof mockExercises>)(event)

    expect(result).toEqual(mockExercises)
    expect(mockFindManyExercise).toHaveBeenCalledWith({
      where: {},
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' },
    })
  })

  test('throws 500 on database error and logs it', async () => {
    const dbError = new Error('connection reset')
    mockFindManyExercise.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch exercises' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[GET /api/exercises] Failed to fetch exercises',
      dbError,
    )
    consoleSpy.mockRestore()
  })
})
