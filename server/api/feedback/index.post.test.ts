/**
 * Tests for server/api/feedback/index.post.ts
 *
 * The global `supabase` stub's storage.from() returns a fresh object per call,
 * so each test installs one shared bucket mock to assert upload/remove/URL calls.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Feedback } from '@prisma/client'

import { randomUUID } from 'node:crypto'
import handler from './index.post'

// A fixed UUID by default, so storage keys can be asserted exactly.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>()
  const randomUUID = vi.fn()
  return { ...actual, default: { ...actual, randomUUID }, randomUUID }
})
const mockRandomUUID = randomUUID as unknown as ReturnType<typeof vi.fn>
const UUID = '00000000-0000-4000-8000-000000000001'

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
    mockRandomUUID.mockReturnValue(UUID)
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
      `user001/${NOW.getTime()}-${UUID}-shot.png`,
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

    expect(mockBucket.upload.mock.calls[0]![0]).toBe(`user001/${NOW.getTime()}-${UUID}-screenshot-${NOW.getTime()}`)
  })

  // Regression: the client's filename went into the storage key unchanged, so
  // "../" segments could climb out of the caller's `${userId}/` folder.
  describe('the client filename is reduced to one safe segment inside the user\'s folder', () => {
    const uploadedKey = async (filename: string) => {
      mockReadMultipart.mockResolvedValueOnce([contentPart(), screenshotPart({ filename })])
      await run(makeEvent())
      return mockBucket.upload.mock.calls[0]![0] as string
    }

    test.each([
      ['parent-directory segments', '../../../victim/evil.png', 'evil.png'],
      ['Windows separators', '..\\..\\victim\\evil.png', 'evil.png'],
      ['spaces and punctuation', 'my shot (1).png', 'my_shot__1_.png'],
      ['a leading dot', '.hidden.png', 'hidden.png'],
    ])('%s: %j → %j', async (_label, filename, safe) => {
      expect(await uploadedKey(filename)).toBe(`user001/${NOW.getTime()}-${UUID}-${safe}`)
    })

    test.each([['only dots', '..'], ['only a separator', '/'], ['empty', '']])(
      'a name that is %s falls back to a generated one',
      async (_label, filename) => {
        expect(await uploadedKey(filename)).toBe(`user001/${NOW.getTime()}-${UUID}-screenshot-${NOW.getTime()}`)
      },
    )

    test('a very long name is capped, keeping its extension', async () => {
      const key = await uploadedKey(`${'a'.repeat(300)}.png`)
      const name = key.slice(`user001/${NOW.getTime()}-${UUID}-`.length)
      expect(name).toHaveLength(100)
      expect(name.endsWith('.png')).toBe(true)
    })

    // Regression (CodeRabbit, PR #156): sanitizing maps different names to the
    // same one ("a b.png" and "a_b.png"), and with upsert: false a colliding key
    // fails the second upload. A random UUID also makes the public URL unguessable.
    test('two uploads in the same millisecond whose names sanitize alike get distinct keys', async () => {
      mockRandomUUID.mockReturnValueOnce('uuid-a').mockReturnValueOnce('uuid-b')
      const first = await uploadedKey('a b.png')
      mockBucket.upload.mockClear()
      const second = await uploadedKey('a_b.png')

      expect(first).toBe(`user001/${NOW.getTime()}-uuid-a-a_b.png`)
      expect(second).toBe(`user001/${NOW.getTime()}-uuid-b-a_b.png`)
    })

    test('whatever the name, the key is exactly `${userId}/<one segment>` with no ".." segment', async () => {
      const key = await uploadedKey('a/../../b/./../c/%2e%2e/d.png')
      const segments = key.split('/')
      expect(segments).toHaveLength(2)
      expect(segments[0]).toBe('user001')
      expect(segments).not.toContain('..')
    })
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
