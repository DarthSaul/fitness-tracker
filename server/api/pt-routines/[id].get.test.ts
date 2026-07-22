/**
 * Tests for server/api/pt-routines/[id].get.ts
 *
 * Coverage strategy:
 *  - Happy path: returns the routine with ordered exercises
 *  - Validation: throws 400 when the routine ID is missing
 *  - Not found / ownership: throws 404 when missing or owned by another user
 *  - Error propagation: throws 500 on unexpected error
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].get'

const mockFindUnique = (prisma as typeof prisma).ptRoutine.findUnique as ReturnType<typeof vi.fn>
const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id: string | undefined = 'rt001') {
  mockGetRouterParam.mockReturnValue(id)
  return {
    path: `/api/pt-routines/${id}`,
    context: { userId: 'user001' },
  }
}

const mockRoutine = {
  id: 'rt001',
  userId: 'user001',
  name: 'Knee Rehab',
  createdAt: new Date(),
  updatedAt: new Date(),
  exercises: [
    { id: 'rtex001', ptRoutineId: 'rt001', order: 1, title: 'Clamshells', durationSeconds: null, reps: 15 },
  ],
}

describe('GET /api/pt-routines/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('returns the routine with ordered exercises', async () => {
    mockFindUnique.mockResolvedValueOnce(mockRoutine)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockRoutine)
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'rt001' },
      include: { exercises: { orderBy: { order: 'asc' } } },
    })
  })

  test('throws 400 when routine ID is missing', async () => {
    const event = makeEvent()
    mockGetRouterParam.mockReturnValue(undefined)
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing routine ID' })
  })

  test('throws 404 when routine does not exist', async () => {
    mockFindUnique.mockResolvedValueOnce(null)

    const event = makeEvent('nonexistent')
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Routine not found' })
  })

  test('throws 404 when routine belongs to another user', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...mockRoutine, userId: 'user999' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Routine not found' })
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockFindUnique.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch routine' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'GET /api/pt-routines/:id' }, '[GET /api/pt-routines/:id] Failed to fetch routine')
    consoleSpy.mockRestore()
  })
})
