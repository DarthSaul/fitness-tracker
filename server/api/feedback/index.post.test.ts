/**
 * Tests for server/api/feedback/index.post.ts
 *
 * The global `supabase` stub's storage.from() returns a fresh object per call,
 * so each test installs one shared bucket mock to assert upload/remove/URL calls.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Feedback } from '@prisma/client'

import handler from './index.post'

const mockReadMultipart = readMultipartFormData as ReturnType<typeof vi.fn>
const mockCreateFeedback = (prisma as typeof prisma).feedback.create as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>
const mockLoggerError = (logger as unknown as { error: ReturnType<typeof vi.fn> }).error

const mockBucket = {
  upload: vi.fn(),
  remove: vi.fn(),
  getPublicUrl: vi.fn(),
}
const mockFrom = vi.fn(() => mockBucket)

const NOW = new Date('2026-10-05T12:00:00.000Z')

const mockFeedback: Feedback & { user: { name: string } } = {
  id: 'fb001',
  userId: 'user001',
  content: 'The set timer drifts',
  screenshotPath: null,
  addressed: false,
  createdAt: NOW,
  user: { name: 'Ada' },
}

type Part = { name: string; data: Buffer; type?: string; filename?: string }

const contentPart = (text = 'The set timer drifts'): Part => ({ name: 'content', data: Buffer.from(text) })
const screenshotPart = (overrides: Partial<Part> = {}): Part => ({
  name: 'screenshot',
  data: Buffer.from('png-bytes'),
  type: 'image/png',
  filename: 'shot.png',
  ...overrides,
})

function makeEvent() {
  return {
    path: '/api/feedback',
    context: { userId: 'user001' } as Record<string, unknown>,
    node: { res: { statusCode: 200 } },
  }
}

const run = (event: ReturnType<typeof makeEvent>) =>
  (handler as unknown as (e: typeof event) => Promise<Record<string, unknown>>)(event)

describe('POST /api/feedback', () => {
  const originalSupabaseStorage = (supabase as { storage: unknown }).storage

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    ;(supabase as { storage: unknown }).storage = { from: mockFrom }
    mockFrom.mockReturnValue(mockBucket)
    mockBucket.upload.mockResolvedValue({ data: { path: 'user001/shot.png' }, error: null })
    mockBucket.remove.mockResolvedValue({ data: null, error: null })
    mockBucket.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.test/shot.png' } })
    mockReadMultipart.mockResolvedValue([contentPart()])
    mockCreateFeedback.mockResolvedValue(mockFeedback)
  })

  afterEach(() => {
    vi.useRealTimers()
    ;(supabase as { storage: unknown }).storage = originalSupabaseStorage
  })

  test('saves text-only feedback, responds 201 and returns a null screenshotUrl', async () => {
    const event = makeEvent()

    const result = await run(event)

    expect(mockCreateFeedback).toHaveBeenCalledWith({
      data: { userId: 'user001', content: 'The set timer drifts', screenshotPath: null },
      include: { user: { select: { name: true } } },
    })
    expect(mockBucket.upload).not.toHaveBeenCalled()
    expect(event.node.res.statusCode).toBe(201)
    expect(result).toEqual({ ...mockFeedback, screenshotUrl: null })
  })

  test('trims surrounding whitespace from the content', async () => {
    mockReadMultipart.mockResolvedValueOnce([contentPart('  needs trimming \n')])

    await run(makeEvent())

    expect(mockCreateFeedback.mock.calls[0]![0].data.content).toBe('needs trimming')
  })

  test('uploads the screenshot, stores its path and returns the public URL', async () => {
    mockReadMultipart.mockResolvedValueOnce([contentPart(), screenshotPart()])
    mockCreateFeedback.mockResolvedValueOnce({ ...mockFeedback, screenshotPath: 'user001/shot.png' })

    const result = await run(makeEvent())

    expect(mockFrom).toHaveBeenCalledWith('feedback-screenshots')
    expect(mockBucket.upload).toHaveBeenCalledWith(
      `user001/${NOW.getTime()}-shot.png`,
      Buffer.from('png-bytes'),
      { contentType: 'image/png', upsert: false },
    )
    expect(mockCreateFeedback.mock.calls[0]![0].data.screenshotPath).toBe('user001/shot.png')
    expect(mockBucket.getPublicUrl).toHaveBeenCalledWith('user001/shot.png')
    expect(result.screenshotUrl).toBe('https://cdn.test/shot.png')
  })

  test('generates a filename when the screenshot part has none', async () => {
    mockReadMultipart.mockResolvedValueOnce([contentPart(), screenshotPart({ filename: undefined })])

    await run(makeEvent())

    expect(mockBucket.upload.mock.calls[0]![0]).toBe(`user001/${NOW.getTime()}-screenshot-${NOW.getTime()}`)
  })

  test('ignores an empty screenshot part', async () => {
    mockReadMultipart.mockResolvedValueOnce([contentPart(), screenshotPart({ data: Buffer.alloc(0) })])

    await run(makeEvent())

    expect(mockBucket.upload).not.toHaveBeenCalled()
    expect(mockCreateFeedback.mock.calls[0]![0].data.screenshotPath).toBeNull()
  })

  test('accepts a screenshot of exactly 5 MB', async () => {
    mockReadMultipart.mockResolvedValueOnce([contentPart(), screenshotPart({ data: Buffer.alloc(5 * 1024 * 1024) })])

    await run(makeEvent())

    expect(mockBucket.upload).toHaveBeenCalledTimes(1)
  })

  test('returns 400 when there is no multipart body', async () => {
    mockReadMultipart.mockResolvedValueOnce(undefined)

    await expect(run(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing content' })
    expect(mockCreateFeedback).not.toHaveBeenCalled()
  })

  test('returns 400 when the content part is missing', async () => {
    mockReadMultipart.mockResolvedValueOnce([screenshotPart()])

    await expect(run(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing content' })
    expect(mockBucket.upload).not.toHaveBeenCalled()
  })

  test('returns 400 when the content is only whitespace', async () => {
    mockReadMultipart.mockResolvedValueOnce([contentPart('   \n ')])

    await expect(run(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing content' })
  })

  test('returns 400 when the screenshot is not an image', async () => {
    mockReadMultipart.mockResolvedValueOnce([contentPart(), screenshotPart({ type: 'application/pdf' })])

    await expect(run(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Screenshot must be an image' })
    expect(mockBucket.upload).not.toHaveBeenCalled()
    expect(mockCreateFeedback).not.toHaveBeenCalled()
  })

  test('returns 400 when the screenshot has no content type', async () => {
    mockReadMultipart.mockResolvedValueOnce([contentPart(), screenshotPart({ type: undefined })])

    await expect(run(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Screenshot must be an image' })
  })

  test('returns 400 when the screenshot is over 5 MB', async () => {
    mockReadMultipart.mockResolvedValueOnce([contentPart(), screenshotPart({ data: Buffer.alloc(5 * 1024 * 1024 + 1) })])

    await expect(run(makeEvent())).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Screenshot must be under 5 MB' })
    expect(mockBucket.upload).not.toHaveBeenCalled()
  })

  test('returns 500 and logs when the screenshot upload fails', async () => {
    const uploadError = { message: 'bucket unavailable' }
    mockReadMultipart.mockResolvedValueOnce([contentPart(), screenshotPart()])
    mockBucket.upload.mockResolvedValueOnce({ data: null, error: uploadError })

    await expect(run(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to upload screenshot' })

    expect(mockLoggerError).toHaveBeenCalledWith(
      { err: uploadError, route: 'POST /api/feedback' },
      '[POST /api/feedback] Screenshot upload failed',
    )
    expect(mockCreateFeedback).not.toHaveBeenCalled()
  })

  test('removes the uploaded screenshot, returns 500 and logs when the database write fails', async () => {
    const dbError = new Error('db down')
    mockReadMultipart.mockResolvedValueOnce([contentPart(), screenshotPart()])
    mockCreateFeedback.mockRejectedValueOnce(dbError)

    await expect(run(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to save feedback' })

    expect(mockBucket.remove).toHaveBeenCalledWith(['user001/shot.png'])
    expect(mockLoggerError).toHaveBeenCalledWith(
      { err: dbError, route: 'POST /api/feedback' },
      '[POST /api/feedback] Failed to save feedback',
    )
  })

  // Regression: the cleanup's result was ignored. Supabase reports a failed
  // remove as `{ error }`, so the orphaned screenshot went unlogged; and a
  // thrown failure replaced the database error that caused the cleanup.
  describe('when removing the orphaned screenshot also fails', () => {
    const mockLoggerWarn = (logger as unknown as { warn: ReturnType<typeof vi.fn> }).warn
    const dbError = new Error('db down')

    beforeEach(() => {
      mockReadMultipart.mockResolvedValueOnce([contentPart(), screenshotPart()])
      mockCreateFeedback.mockRejectedValueOnce(dbError)
    })

    test('a reported failure ({ error }) is logged with the orphaned path', async () => {
      const removeError = { message: 'storage unavailable' }
      mockBucket.remove.mockResolvedValueOnce({ data: null, error: removeError })

      await expect(run(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to save feedback' })

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        { err: removeError, path: 'user001/shot.png', route: 'POST /api/feedback' },
        '[POST /api/feedback] Failed to remove orphaned screenshot',
      )
      expect(mockLoggerError).toHaveBeenCalledWith({ err: dbError, route: 'POST /api/feedback' }, '[POST /api/feedback] Failed to save feedback')
    })

    test('a thrown failure is logged too, and the database error is still the one reported', async () => {
      const thrown = new Error('socket hang up')
      mockBucket.remove.mockRejectedValueOnce(thrown)

      await expect(run(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to save feedback' })

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        { err: thrown, path: 'user001/shot.png', route: 'POST /api/feedback' },
        '[POST /api/feedback] Failed to remove orphaned screenshot',
      )
      expect(mockLoggerError).toHaveBeenCalledTimes(1)
      expect(mockLoggerError).toHaveBeenCalledWith({ err: dbError, route: 'POST /api/feedback' }, '[POST /api/feedback] Failed to save feedback')
    })

    test('a successful cleanup logs no warning', async () => {
      await expect(run(makeEvent())).rejects.toMatchObject({ statusCode: 500 })
      expect(mockLoggerWarn).not.toHaveBeenCalled()
    })
  })

  test('does not touch storage when a text-only database write fails', async () => {
    mockCreateFeedback.mockRejectedValueOnce(new Error('db down'))

    await expect(run(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to save feedback' })

    expect(mockBucket.remove).not.toHaveBeenCalled()
  })

  test('returns 500 when reading the multipart body throws', async () => {
    const parseError = new Error('malformed multipart')
    mockReadMultipart.mockRejectedValueOnce(parseError)

    await expect(run(makeEvent())).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to save feedback' })
    expect(mockLoggerError).toHaveBeenCalledWith(
      { err: parseError, route: 'POST /api/feedback' },
      '[POST /api/feedback] Failed to save feedback',
    )
  })

  test('prefers the request-scoped logger when present', async () => {
    const scoped = { error: vi.fn() }
    const event = makeEvent()
    event.context.logger = scoped
    mockCreateFeedback.mockRejectedValueOnce(new Error('db down'))

    await expect(run(event)).rejects.toMatchObject({ statusCode: 500 })

    expect(scoped.error).toHaveBeenCalledTimes(1)
    expect(mockLoggerError).not.toHaveBeenCalled()
  })
})
