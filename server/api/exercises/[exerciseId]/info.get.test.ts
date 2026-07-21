import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './info.get'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockFindUniqueExercise = (prisma as typeof prisma).exercise.findUnique as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

type InfoResult = { id: string; name: string; videoUrl: string | null; animationUrl: string | null }

function makeEvent(exerciseId = 'ex001') {
  mockGetRouterParam.mockReturnValue(exerciseId)
  return {
    path: `/api/exercises/${exerciseId}/info`,
    context: {},
  }
}

describe('GET /api/exercises/:exerciseId/info', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('returns id, name and media URLs for an existing exercise', async () => {
    const exercise = {
      id: 'ex001',
      name: 'Barbell Back Squat',
      videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      animationUrl: null,
    }
    mockFindUniqueExercise.mockResolvedValueOnce(exercise)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<InfoResult>)(event)

    expect(result).toEqual(exercise)
    expect(mockFindUniqueExercise).toHaveBeenCalledWith({
      where: { id: 'ex001' },
      select: { id: true, name: true, videoUrl: true, animationUrl: true },
    })
  })

  test('returns null media URLs when they have not been set', async () => {
    const exercise = { id: 'ex002', name: 'Plank', videoUrl: null, animationUrl: null }
    mockFindUniqueExercise.mockResolvedValueOnce(exercise)

    const event = makeEvent('ex002')
    const result = await (handler as unknown as (e: typeof event) => Promise<InfoResult>)(event)

    expect(result).toEqual(exercise)
  })

  test('throws 400 when exerciseId is missing', async () => {
    const event = makeEvent(undefined as unknown as string)
    mockGetRouterParam.mockReturnValue(undefined)

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing exercise ID' })
    expect(mockFindUniqueExercise).not.toHaveBeenCalled()
  })

  test('throws 400 when exerciseId is whitespace only', async () => {
    const event = makeEvent('   ')
    mockGetRouterParam.mockReturnValue('   ')

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing exercise ID' })
  })

  test('throws 404 when the exercise does not exist', async () => {
    mockFindUniqueExercise.mockResolvedValueOnce(null)

    const event = makeEvent('missing')
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Exercise not found' })
  })

  test('throws 500 on database error and logs it', async () => {
    const dbError = new Error('connection reset')
    mockFindUniqueExercise.mockRejectedValueOnce(dbError)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch exercise info' })

    expect(logger.error).toHaveBeenCalledWith(
      { err: dbError, route: 'GET /api/exercises/:exerciseId/info' },
      '[GET /api/exercises/:exerciseId/info] Failed to fetch exercise info',
    )
  })
})
