import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './info.get'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockFindUniqueExercise = (prisma as typeof prisma).exercise.findUnique as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>
const mockSignExerciseMedia = signExerciseMedia as ReturnType<typeof vi.fn>

type InfoResult = {
  id: string
  name: string
  videoUrl: string | null
  animationUrl: string | null
  posterUrl: string | null
  mediaExpiresAt: string | null
}

const SELECT = { id: true, name: true, videoUrl: true, animationPath: true, posterPath: true }
const NO_MEDIA = { animationUrl: null, posterUrl: null, mediaExpiresAt: null }

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
    mockSignExerciseMedia.mockResolvedValue(NO_MEDIA)
  })

  test('returns id, name, the YouTube link and freshly signed media URLs', async () => {
    const row = {
      id: 'ex001',
      name: 'Pull Up',
      videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      animationPath: 'exercises/pull-up/Dsmuo9mKczX89uWg/demo.mp4',
      posterPath: 'exercises/pull-up/Dsmuo9mKczX89uWg/poster.webp',
    }
    const signed = {
      animationUrl: 'https://test.supabase.co/storage/v1/object/sign/exercise-media/exercises/pull-up/Dsmuo9mKczX89uWg/demo.mp4?token=sig',
      posterUrl: 'https://test.supabase.co/storage/v1/object/sign/exercise-media/exercises/pull-up/Dsmuo9mKczX89uWg/poster.webp?token=sig',
      mediaExpiresAt: '2026-09-10T15:15:00.000Z',
    }
    mockFindUniqueExercise.mockResolvedValueOnce(row)
    mockSignExerciseMedia.mockResolvedValueOnce(signed)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<InfoResult>)(event)

    expect(mockFindUniqueExercise).toHaveBeenCalledWith({ where: { id: 'ex001' }, select: SELECT })
    expect(mockSignExerciseMedia).toHaveBeenCalledWith({ animationPath: row.animationPath, posterPath: row.posterPath })
    expect(result).toEqual({ id: 'ex001', name: 'Pull Up', videoUrl: row.videoUrl, ...signed })
  })

  test('never leaks the raw storage keys in the response', async () => {
    mockFindUniqueExercise.mockResolvedValueOnce({
      id: 'ex001', name: 'Pull Up', videoUrl: null,
      animationPath: 'exercises/pull-up/Dsmuo9mKczX89uWg/demo.mp4',
      posterPath: 'exercises/pull-up/Dsmuo9mKczX89uWg/poster.webp',
    })
    mockSignExerciseMedia.mockResolvedValueOnce({
      animationUrl: 'https://test.supabase.co/signed/demo', posterUrl: 'https://test.supabase.co/signed/poster', mediaExpiresAt: '2026-09-10T15:15:00.000Z',
    })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<Record<string, unknown>>)(event)

    expect(result).not.toHaveProperty('animationPath')
    expect(result).not.toHaveProperty('posterPath')
  })

  test('returns null media URLs when no clip is attached', async () => {
    mockFindUniqueExercise.mockResolvedValueOnce({ id: 'ex002', name: 'Plank', videoUrl: null, animationPath: null, posterPath: null })

    const event = makeEvent('ex002')
    const result = await (handler as unknown as (e: typeof event) => Promise<InfoResult>)(event)

    expect(result).toEqual({ id: 'ex002', name: 'Plank', videoUrl: null, ...NO_MEDIA })
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
    expect(mockSignExerciseMedia).not.toHaveBeenCalled()
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

  test('throws 500 and logs when storage cannot sign the media', async () => {
    mockFindUniqueExercise.mockResolvedValueOnce({
      id: 'ex001', name: 'Pull Up', videoUrl: null,
      animationPath: 'exercises/pull-up/Dsmuo9mKczX89uWg/demo.mp4',
      posterPath: 'exercises/pull-up/Dsmuo9mKczX89uWg/poster.webp',
    })
    const signError = new Error('exercise-media: signing failed: Bucket not found')
    mockSignExerciseMedia.mockRejectedValueOnce(signError)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch exercise info' })

    expect(logger.error).toHaveBeenCalledWith(
      { err: signError, route: 'GET /api/exercises/:exerciseId/info' },
      '[GET /api/exercises/:exerciseId/info] Failed to fetch exercise info',
    )
  })
})
