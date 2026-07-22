import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './me.get'

const mockFindUniqueUser = (prisma as typeof prisma).user.findUnique as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent() {
  return {
    path: '/api/auth/me',
    context: { userId: 'user001' },
  }
}

const mockUser = {
  id: 'user001',
  email: 'jane@example.com',
  name: 'Jane Appleseed',
  avatarUrl: null,
  ptRoutineInWorkout: false,
}

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('returns the authenticated user profile', async () => {
    mockFindUniqueUser.mockResolvedValueOnce(mockUser)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<typeof mockUser>)(event)

    expect(result).toEqual(mockUser)
    expect(mockFindUniqueUser).toHaveBeenCalledWith({
      where: { id: 'user001' },
      select: { id: true, email: true, name: true, avatarUrl: true, ptRoutineInWorkout: true },
    })
  })

  test('throws 404 when user record is missing', async () => {
    mockFindUniqueUser.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User not found' })
  })

  test('throws 500 on unexpected database error', async () => {
    const dbError = new Error('connection reset')
    mockFindUniqueUser.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch current user' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'GET /api/auth/me' }, '[GET /api/auth/me] Failed to fetch current user')
    consoleSpy.mockRestore()
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('User not found') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'User not found'
    mockFindUniqueUser.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
  })
})
