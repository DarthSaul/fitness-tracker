/**
 * Tests for server/api/feedback/index.get.ts
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

import handler from './index.get'

const mockFindMany = (prisma as typeof prisma).feedback.findMany as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>
const mockLoggerError = (logger as unknown as { error: ReturnType<typeof vi.fn> }).error

const mockBucket = { getPublicUrl: vi.fn() }
const mockFrom = vi.fn(() => mockBucket)

const base = {
  userId: 'user001',
  content: 'Great app',
  addressed: false,
  createdAt: new Date('2026-10-05T12:00:00.000Z'),
  user: { name: 'Ada' },
}

const run = (event: { path: string; context: Record<string, unknown> }) =>
  (handler as unknown as (e: typeof event) => Promise<Array<Record<string, unknown>>>)(event)

describe('GET /api/feedback', () => {
  const originalSupabaseStorage = (supabase as { storage: unknown }).storage

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    ;(supabase as { storage: unknown }).storage = { from: mockFrom }
    mockFrom.mockReturnValue(mockBucket)
    mockBucket.getPublicUrl.mockImplementation((path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }))
  })

  afterEach(() => {
    ;(supabase as { storage: unknown }).storage = originalSupabaseStorage
  })

  test('returns feedback newest first with the author name included', async () => {
    mockFindMany.mockResolvedValueOnce([])

    await run({ path: '/api/feedback', context: { userId: 'user001' } })

    expect(mockFindMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true } } },
    })
  })

  test('adds a public screenshotUrl only to entries that have a screenshot', async () => {
    mockFindMany.mockResolvedValueOnce([
      { ...base, id: 'fb2', screenshotPath: 'user001/shot.png' },
      { ...base, id: 'fb1', screenshotPath: null },
    ])

    const result = await run({ path: '/api/feedback', context: { userId: 'user001' } })

    expect(result).toEqual([
      { ...base, id: 'fb2', screenshotPath: 'user001/shot.png', screenshotUrl: 'https://cdn.test/user001/shot.png' },
      { ...base, id: 'fb1', screenshotPath: null, screenshotUrl: null },
    ])
    expect(mockFrom).toHaveBeenCalledWith('feedback-screenshots')
    expect(mockBucket.getPublicUrl).toHaveBeenCalledTimes(1)
  })

  test('returns an empty list when there is no feedback', async () => {
    mockFindMany.mockResolvedValueOnce([])

    expect(await run({ path: '/api/feedback', context: { userId: 'user001' } })).toEqual([])
  })

  test('returns 500 and logs when the query fails', async () => {
    const dbError = new Error('db down')
    mockFindMany.mockRejectedValueOnce(dbError)

    await expect(run({ path: '/api/feedback', context: { userId: 'user001' } })).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Failed to fetch feedback',
    })
    expect(mockLoggerError).toHaveBeenCalledWith(
      { err: dbError, route: 'GET /api/feedback' },
      '[GET /api/feedback] Failed to fetch feedback',
    )
  })

  test('prefers the request-scoped logger when present', async () => {
    const scoped = { error: vi.fn() }
    mockFindMany.mockRejectedValueOnce(new Error('db down'))

    await expect(run({ path: '/api/feedback', context: { userId: 'u', logger: scoped } })).rejects.toMatchObject({ statusCode: 500 })

    expect(scoped.error).toHaveBeenCalledTimes(1)
    expect(mockLoggerError).not.toHaveBeenCalled()
  })
})
