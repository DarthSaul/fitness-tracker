import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  EXERCISE_MEDIA_BUCKET,
  EXERCISE_MEDIA_TTL_SECONDS,
  signExerciseMedia,
} from './exercise-media'

const mockFrom = (supabase as typeof supabase).storage.from as ReturnType<typeof vi.fn>
const mockCreateSignedUrls = vi.fn()

const ANIMATION = 'exercises/pull-up/Dsmuo9mKczX89uWg/demo.mp4'
const POSTER = 'exercises/pull-up/Dsmuo9mKczX89uWg/poster.webp'
const signed = (path: string) => `https://test.supabase.co/storage/v1/object/sign/exercise-media/${path}?token=sig`

describe('signExerciseMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T15:00:00.000Z'))
    mockFrom.mockReturnValue({ createSignedUrls: mockCreateSignedUrls })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('uses a 15-minute TTL and the private exercise-media bucket', () => {
    expect(EXERCISE_MEDIA_TTL_SECONDS).toBe(900)
    expect(EXERCISE_MEDIA_BUCKET).toBe('exercise-media')
  })

  test('returns nulls without touching storage when the exercise has no media', async () => {
    const result = await signExerciseMedia({ animationPath: null, posterPath: null })

    expect(result).toEqual({ animationUrl: null, posterUrl: null, mediaExpiresAt: null })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  test('signs both keys in one call and reports when they expire', async () => {
    mockCreateSignedUrls.mockResolvedValueOnce({
      data: [
        { path: ANIMATION, signedUrl: signed(ANIMATION), error: null },
        { path: POSTER, signedUrl: signed(POSTER), error: null },
      ],
      error: null,
    })

    const result = await signExerciseMedia({ animationPath: ANIMATION, posterPath: POSTER })

    expect(mockFrom).toHaveBeenCalledWith('exercise-media')
    expect(mockCreateSignedUrls).toHaveBeenCalledWith([ANIMATION, POSTER], 900)
    expect(result).toEqual({
      animationUrl: signed(ANIMATION),
      posterUrl: signed(POSTER),
      mediaExpiresAt: '2026-09-10T15:15:00.000Z',
    })
  })

  test('maps signed URLs back by path, not by position', async () => {
    mockCreateSignedUrls.mockResolvedValueOnce({
      data: [
        { path: POSTER, signedUrl: signed(POSTER), error: null },
        { path: ANIMATION, signedUrl: signed(ANIMATION), error: null },
      ],
      error: null,
    })

    const result = await signExerciseMedia({ animationPath: ANIMATION, posterPath: POSTER })

    expect(result.animationUrl).toBe(signed(ANIMATION))
    expect(result.posterUrl).toBe(signed(POSTER))
  })

  test('signs only the key that exists when the other is missing', async () => {
    mockCreateSignedUrls.mockResolvedValueOnce({
      data: [{ path: ANIMATION, signedUrl: signed(ANIMATION), error: null }],
      error: null,
    })

    const result = await signExerciseMedia({ animationPath: ANIMATION, posterPath: null })

    expect(mockCreateSignedUrls).toHaveBeenCalledWith([ANIMATION], 900)
    expect(result).toEqual({
      animationUrl: signed(ANIMATION),
      posterUrl: null,
      mediaExpiresAt: '2026-09-10T15:15:00.000Z',
    })
  })

  test('throws when storage rejects the signing request', async () => {
    mockCreateSignedUrls.mockResolvedValueOnce({ data: null, error: { message: 'Bucket not found' } })

    await expect(signExerciseMedia({ animationPath: ANIMATION, posterPath: POSTER }))
      .rejects.toThrow(/Bucket not found/)
  })

  test('throws when storage cannot sign one of the keys', async () => {
    mockCreateSignedUrls.mockResolvedValueOnce({
      data: [
        { path: ANIMATION, signedUrl: signed(ANIMATION), error: null },
        { path: POSTER, signedUrl: null, error: 'Object not found' },
      ],
      error: null,
    })

    await expect(signExerciseMedia({ animationPath: ANIMATION, posterPath: POSTER }))
      .rejects.toThrow(/poster\.webp.*Object not found/)
  })
})
