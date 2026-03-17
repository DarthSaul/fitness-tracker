/**
 * Tests for server/api/user-programs/index.get.ts
 *
 * Coverage strategy:
 *  - Happy path: returns list of user programs with nested program details
 *  - Empty list: returns empty array when user has no saved programs
 *  - Error propagation: throws 500 when findMany rejects (non-H3 error)
 *  - H3 error pass-through: re-throws H3 errors without wrapping as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.get'

const mockFindMany = (prisma as typeof prisma).userProgram.findMany as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent() {
  return { path: '/api/user-programs', context: { userId: 'user001' } }
}

const mockUserPrograms = [
  {
    id: 'up001',
    userId: 'user001',
    programId: 'prog001',
    isActive: true,
    currentWeek: 1,
    currentDay: 1,
    startedAt: new Date(),
    program: { id: 'prog001', name: 'Brick House', description: 'A strength program' },
  },
  {
    id: 'up002',
    userId: 'user001',
    programId: 'prog002',
    isActive: false,
    currentWeek: 2,
    currentDay: 3,
    startedAt: new Date(),
    program: { id: 'prog002', name: 'Cardio Blast', description: null },
  },
]

describe('GET /api/user-programs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('returns list of user programs with nested program details', async () => {
    mockFindMany.mockResolvedValueOnce(mockUserPrograms)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockUserPrograms)
    expect(mockFindMany).toHaveBeenCalledOnce()
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user001' },
      include: {
        program: { select: { id: true, name: true, description: true } },
      },
      orderBy: { startedAt: 'desc' },
    })
  })

  test('returns empty array when user has no saved programs', async () => {
    mockFindMany.mockResolvedValueOnce([])

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual([])
  })

  test('throws 500 when findMany rejects with a non-H3 error', async () => {
    const dbError = new Error('database timeout')
    mockFindMany.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to list user programs' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[GET /api/user-programs] Failed to list user programs',
      dbError,
    )
    consoleSpy.mockRestore()
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('Unauthorized') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 401
    h3Error.statusMessage = 'Unauthorized'
    mockFindMany.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(401)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
