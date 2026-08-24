/**
 * Tests for server/api/auth/me.delete.ts — full account deletion.
 *
 * Coverage strategy:
 *  - Happy path (OAuth-only user): deletes the User row (cascade takes every
 *    owned table), clears the web session, returns { success: true }, and
 *    never touches the Supabase admin API
 *  - Email identity: deletes the GoTrue user BEFORE the database row, so a
 *    Supabase failure leaves the account intact and the request retryable
 *  - Supabase 404 (auth user already gone): treated as success so a retry
 *    after a partial failure can complete
 *  - Feedback screenshots: removed from the storage bucket; best-effort —
 *    a storage error is logged but does not block deletion
 *  - Not found: 404 when the user record is missing
 *  - Error propagation: 500 on unexpected error, H3 errors pass through
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './me.delete'

const mockFindUniqueUser = (prisma as typeof prisma).user.findUnique as ReturnType<typeof vi.fn>
const mockDeleteUser = (prisma as typeof prisma).user.delete as ReturnType<typeof vi.fn>
const mockAdminDeleteUser = supabase.auth.admin.deleteUser as ReturnType<typeof vi.fn>
const mockStorageFrom = supabase.storage.from as ReturnType<typeof vi.fn>
const mockClearUserSession = clearUserSession as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent() {
  return {
    path: '/api/auth/me',
    context: { userId: 'user001' },
  }
}

type Handler = (e: ReturnType<typeof makeEvent>) => Promise<unknown>
const run = (event = makeEvent()) => (handler as unknown as Handler)(event)

/** A user record as the handler selects it: identities + feedback paths. */
function dbUser(overrides: Partial<{ identities: unknown[], feedback: unknown[] }> = {}) {
  return {
    id: 'user001',
    identities: [],
    feedback: [],
    ...overrides,
  }
}

const storageRemove = vi.fn()

describe('DELETE /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number, statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number, statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockFindUniqueUser.mockResolvedValue(dbUser())
    mockDeleteUser.mockResolvedValue({ id: 'user001' })
    mockAdminDeleteUser.mockResolvedValue({ data: {}, error: null })
    storageRemove.mockResolvedValue({ data: null, error: null })
    mockStorageFrom.mockReturnValue({ remove: storageRemove })
    mockClearUserSession.mockResolvedValue(undefined)
  })

  test('deletes the user row, clears the session and reports success', async () => {
    const event = makeEvent()
    const result = await run(event)

    expect(result).toEqual({ success: true })
    expect(mockDeleteUser).toHaveBeenCalledWith({ where: { id: 'user001' } })
    expect(mockClearUserSession).toHaveBeenCalledWith(event)
  })

  test('never calls the Supabase admin API for an OAuth-only account', async () => {
    mockFindUniqueUser.mockResolvedValueOnce(dbUser({
      identities: [{ provider: 'google', providerId: 'google-sub-1' }],
    }))

    await run()

    expect(mockAdminDeleteUser).not.toHaveBeenCalled()
    expect(mockDeleteUser).toHaveBeenCalled()
  })

  test('deletes the Supabase Auth user behind an email identity', async () => {
    mockFindUniqueUser.mockResolvedValueOnce(dbUser({
      identities: [
        { provider: 'google', providerId: 'google-sub-1' },
        { provider: 'email', providerId: 'gotrue-user-id' },
      ],
    }))

    await run()

    expect(mockAdminDeleteUser).toHaveBeenCalledWith('gotrue-user-id')
    expect(mockDeleteUser).toHaveBeenCalled()
  })

  test('throws 500 and deletes nothing when the Supabase Auth deletion fails', async () => {
    mockFindUniqueUser.mockResolvedValueOnce(dbUser({
      identities: [{ provider: 'email', providerId: 'gotrue-user-id' }],
    }))
    mockAdminDeleteUser.mockResolvedValueOnce({
      data: null,
      error: { status: 500, message: 'service unavailable' },
    })

    await expect(run()).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Failed to delete account. Please try again.',
    })

    // The account must stay intact so the request is retryable.
    expect(mockDeleteUser).not.toHaveBeenCalled()
    expect(mockClearUserSession).not.toHaveBeenCalled()
  })

  test('treats an already-deleted Supabase Auth user as success', async () => {
    mockFindUniqueUser.mockResolvedValueOnce(dbUser({
      identities: [{ provider: 'email', providerId: 'gotrue-user-id' }],
    }))
    mockAdminDeleteUser.mockResolvedValueOnce({
      data: null,
      error: { status: 404, message: 'User not found' },
    })

    const result = await run()

    expect(result).toEqual({ success: true })
    expect(mockDeleteUser).toHaveBeenCalled()
  })

  test('removes feedback screenshots from storage, skipping null paths', async () => {
    mockFindUniqueUser.mockResolvedValueOnce(dbUser({
      feedback: [
        { screenshotPath: 'user001/1-a.png' },
        { screenshotPath: null },
        { screenshotPath: 'user001/2-b.png' },
      ],
    }))

    await run()

    expect(mockStorageFrom).toHaveBeenCalledWith('feedback-screenshots')
    expect(storageRemove).toHaveBeenCalledWith(['user001/1-a.png', 'user001/2-b.png'])
  })

  test('does not touch storage when no feedback has a screenshot', async () => {
    mockFindUniqueUser.mockResolvedValueOnce(dbUser({
      feedback: [{ screenshotPath: null }],
    }))

    await run()

    expect(storageRemove).not.toHaveBeenCalled()
  })

  test('still deletes the account when screenshot removal fails, logging the error', async () => {
    mockFindUniqueUser.mockResolvedValueOnce(dbUser({
      feedback: [{ screenshotPath: 'user001/1-a.png' }],
    }))
    storageRemove.mockResolvedValueOnce({ data: null, error: { message: 'bucket unavailable' } })

    const result = await run()

    expect(result).toEqual({ success: true })
    expect(mockDeleteUser).toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ route: 'DELETE /api/auth/me' }),
      expect.stringContaining('screenshot'),
    )
  })

  test('throws 404 when the user record is missing', async () => {
    mockFindUniqueUser.mockResolvedValueOnce(null)

    await expect(run()).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User not found' })
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockDeleteUser.mockRejectedValueOnce(dbError)

    await expect(run()).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Failed to delete account. Please try again.',
    })
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: dbError, route: 'DELETE /api/auth/me' }),
      expect.any(String),
    )
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('User not found') as Error & { statusCode: number, statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'User not found'
    mockFindUniqueUser.mockRejectedValueOnce(h3Error)

    const thrown = await run().catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
