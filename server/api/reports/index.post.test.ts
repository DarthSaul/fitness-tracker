import { describe, test, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'
import * as Sentry from '@sentry/nuxt'

import handler from './index.post'

const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockRateLimitByKey = rateLimitByKey as ReturnType<typeof vi.fn>
const mockRequireVisible = requireVisiblePost as ReturnType<typeof vi.fn>
const mockPostFind = prisma.post.findUnique as ReturnType<typeof vi.fn>
const mockUserFind = prisma.user.findUnique as ReturnType<typeof vi.fn>
const mockBlockFind = prisma.userBlock.findUnique as ReturnType<typeof vi.fn>
const mockReportFind = prisma.report.findFirst as ReturnType<typeof vi.fn>
const mockReportCreate = prisma.report.create as ReturnType<typeof vi.fn>
const mockCapture = Sentry.captureMessage as ReturnType<typeof vi.fn>

type Event = { path: string; context: { userId: string }; node: { res: { statusCode: number } } }

const makeEvent = (): Event => ({ path: '/api/reports', context: { userId: 'me' }, node: { res: { statusCode: 200 } } })
function call(body: unknown, event = makeEvent()) {
  mockReadBody.mockResolvedValueOnce(body)
  return (handler as unknown as (e: Event) => Promise<{ id: string }>)(event)
}

const post = { authorId: 'ann', body: 'Buy cheap pills', sharedWorkoutKind: null, _count: { photos: 2 } }
const ann = { id: 'ann', name: 'Ann', avatarUrl: 'https://a/ann.png' }
const p2002 = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })

describe('POST /api/reports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset, not just clear: an unread Once value would leak into the next test.
    for (const m of [mockRequireVisible, mockPostFind, mockUserFind, mockBlockFind, mockReportFind, mockReportCreate, mockCapture]) m.mockReset()
    mockRateLimitByKey.mockResolvedValue(undefined)
    mockRequireVisible.mockResolvedValue({ id: 'p1', author: { id: 'ann', profileVisibility: 'PUBLIC' } })
    mockPostFind.mockResolvedValue(post)
    mockUserFind.mockResolvedValue(ann)
    mockBlockFind.mockResolvedValue(null)
    mockReportFind.mockResolvedValue(null)
    mockReportCreate.mockResolvedValue({ id: 'r1' })
  })

  describe('a post', () => {
    test('a visible post → 201, snapshotting body, photo count and share, against its author', async () => {
      const event = makeEvent()

      const result = await call({ postId: 'p1', reason: 'SPAM', details: ' scam ' }, event)

      expect(mockRequireVisible).toHaveBeenCalledWith('p1', 'me')
      expect(mockPostFind).toHaveBeenCalledWith({
        where: { id: 'p1' },
        select: { authorId: true, body: true, sharedWorkoutKind: true, _count: { select: { photos: true } } },
      })
      expect(mockReportCreate).toHaveBeenCalledWith({
        data: {
          reporterId: 'me', reportedUserId: 'ann', postId: 'p1', isPostReport: true, reason: 'SPAM', details: 'scam',
          snapshot: { body: 'Buy cheap pills', photoCount: 2, sharedWorkout: false },
        },
        select: { id: true },
      })
      expect(event.node.res.statusCode).toBe(201)
      expect(result).toEqual({ id: 'r1' })
    })

    test('a workout share is recorded as such in the snapshot', async () => {
      mockPostFind.mockResolvedValue({ ...post, body: '', sharedWorkoutKind: 'PROGRAM', _count: { photos: 0 } })

      await call({ postId: 'p1', reason: 'OTHER' })

      expect(mockReportCreate.mock.calls[0]![0].data.snapshot).toEqual({ body: '', photoCount: 0, sharedWorkout: true })
    })

    test('404 for a post the caller cannot see — never reveals it', async () => {
      mockRequireVisible.mockRejectedValue(Object.assign(new Error('Post not found'), { statusCode: 404 }))

      await expect(call({ postId: 'p1', reason: 'SPAM' })).rejects.toMatchObject({ statusCode: 404 })
      expect(mockReportCreate).not.toHaveBeenCalled()
    })

    test('404 when the post is deleted between the gate and the snapshot read', async () => {
      mockPostFind.mockResolvedValue(null)

      await expect(call({ postId: 'p1', reason: 'SPAM' })).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Post not found' })
    })

    test('400 for your own post', async () => {
      mockPostFind.mockResolvedValue({ ...post, authorId: 'me' })

      await expect(call({ postId: 'p1', reason: 'SPAM' })).rejects.toMatchObject({ statusCode: 400 })
      expect(mockReportCreate).not.toHaveBeenCalled()
    })

    test('a repeat report of the same post → 200 with the first id, no new row, no alert', async () => {
      mockReportFind.mockResolvedValue({ id: 'r0' })
      const event = makeEvent()

      expect(await call({ postId: 'p1', reason: 'HATE' }, event)).toEqual({ id: 'r0' })
      expect(mockReportFind).toHaveBeenCalledWith({ where: { reporterId: 'me', postId: 'p1' }, select: { id: true } })
      expect(mockReportCreate).not.toHaveBeenCalled()
      expect(mockCapture).not.toHaveBeenCalled()
      expect(event.node.res.statusCode).toBe(200)
    })
  })

  describe('a user', () => {
    test('another user → 201, snapshotting name and avatar', async () => {
      const event = makeEvent()

      const result = await call({ userId: 'ann', reason: 'IMPERSONATION' }, event)

      expect(mockUserFind).toHaveBeenCalledWith({ where: { id: 'ann' }, select: { id: true, name: true, avatarUrl: true } })
      expect(mockReportCreate).toHaveBeenCalledWith({
        data: {
          reporterId: 'me', reportedUserId: 'ann', isPostReport: false, reason: 'IMPERSONATION', details: null,
          snapshot: { name: 'Ann', avatarUrl: 'https://a/ann.png' },
        },
        select: { id: true },
      })
      expect(event.node.res.statusCode).toBe(201)
      expect(result).toEqual({ id: 'r1' })
    })

    test('404 for a user who does not exist', async () => {
      mockUserFind.mockResolvedValue(null)

      await expect(call({ userId: 'ghost', reason: 'SPAM' })).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User not found' })
    })

    test('404 for a user who blocked the caller — the same as their profile, so the block is not revealed', async () => {
      mockBlockFind.mockResolvedValue({ id: 'b1' })

      await expect(call({ userId: 'ann', reason: 'HARASSMENT' })).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User not found' })
      expect(mockBlockFind).toHaveBeenCalledWith({ where: { blockerId_blockedId: { blockerId: 'ann', blockedId: 'me' } }, select: { id: true } })
      expect(mockReportCreate).not.toHaveBeenCalled()
    })

    test('a user the caller blocked can still be reported — only the reverse direction is checked', async () => {
      await call({ userId: 'ann', reason: 'HARASSMENT' })

      expect(mockBlockFind).toHaveBeenCalledTimes(1)
      expect(mockReportCreate).toHaveBeenCalled()
    })

    test('a repeat report of the same user is matched on user reports only', async () => {
      mockReportFind.mockResolvedValue({ id: 'r0' })

      expect(await call({ userId: 'ann', reason: 'SPAM' })).toEqual({ id: 'r0' })
      expect(mockReportFind).toHaveBeenCalledWith({ where: { reporterId: 'me', reportedUserId: 'ann', isPostReport: false }, select: { id: true } })
    })
  })

  test('a concurrent duplicate (P2002) → 200 with the winner\'s id, no alert', async () => {
    mockReportFind.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'r0' })
    mockReportCreate.mockRejectedValue(p2002())
    const event = makeEvent()

    expect(await call({ postId: 'p1', reason: 'SPAM' }, event)).toEqual({ id: 'r0' })
    expect(event.node.res.statusCode).toBe(200)
    expect(mockCapture).not.toHaveBeenCalled()
  })

  test('a new report alerts the moderator once, with ids and reason only — never text or details', async () => {
    await call({ postId: 'p1', reason: 'SPAM', details: 'secret details' })

    expect(mockCapture).toHaveBeenCalledTimes(1)
    // Fingerprinted per report: each one is a NEW Sentry issue, so a
    // "new issue" alert rule fires for every report, not just the first.
    expect(mockCapture).toHaveBeenCalledWith('social.report', {
      level: 'warning',
      fingerprint: ['social.report', 'r1'],
      tags: { 'report.id': 'r1', 'report.target': 'post', 'report.reason': 'SPAM' },
    })
    expect(logger.info).toHaveBeenCalledWith({ reportId: 'r1', target: 'post', reason: 'SPAM' }, 'social.report')
    expect(JSON.stringify([mockCapture.mock.calls, (logger.info as ReturnType<typeof vi.fn>).mock.calls]))
      .not.toMatch(/secret details|Buy cheap pills/)
  })

  test('a failed alert is logged and still returns 201 — the report is stored', async () => {
    mockCapture.mockImplementation(() => { throw new Error('sentry down') })
    const event = makeEvent()

    expect(await call({ userId: 'ann', reason: 'SPAM' }, event)).toEqual({ id: 'r1' })
    expect(event.node.res.statusCode).toBe(201)
    expect(logger.error).toHaveBeenCalled()
  })

  test('400 from validation, before the rate limit or any read', async () => {
    await expect(call({ postId: 'p1', userId: 'ann', reason: 'SPAM' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(call({ userId: 'me', reason: 'SPAM' })).rejects.toMatchObject({ statusCode: 400 })
    expect(mockRateLimitByKey).not.toHaveBeenCalled()
    expect(mockRequireVisible).not.toHaveBeenCalled()
    expect(mockUserFind).not.toHaveBeenCalled()
  })

  test('rate-limits per user, 20 per hour, before any read', async () => {
    mockRateLimitByKey.mockRejectedValueOnce(Object.assign(new Error('Too many requests'), { statusCode: 429 }))

    await expect(call({ userId: 'ann', reason: 'SPAM' })).rejects.toMatchObject({ statusCode: 429 })
    expect(mockRateLimitByKey).toHaveBeenCalledWith('report:me', 20, '1 h')
    expect(mockUserFind).not.toHaveBeenCalled()
  })

  test('500 with a generic message on a database error', async () => {
    mockReportCreate.mockRejectedValue(new Error('timeout'))

    await expect(call({ userId: 'ann', reason: 'SPAM' })).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to create report' })
    expect(logger.error).toHaveBeenCalled()
  })
})
