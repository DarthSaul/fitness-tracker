/**
 * Tests for server/api/pt-routines/[id].delete.ts
 *
 * Coverage strategy:
 *  - Happy path: deletes the routine (children cascade) and returns success
 *  - Validation: throws 400 when the routine ID is missing
 *  - Not found / ownership: throws 404 when missing or owned by another user
 *  - Error propagation: throws 500 on unexpected error
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].delete'

const mockFindUnique = (prisma as typeof prisma).ptRoutine.findUnique as ReturnType<typeof vi.fn>
const mockDelete = (prisma as typeof prisma).ptRoutine.delete as ReturnType<typeof vi.fn>
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
}

describe('DELETE /api/pt-routines/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('deletes the routine and returns success', async () => {
    mockFindUnique.mockResolvedValueOnce(mockRoutine)
    mockDelete.mockResolvedValueOnce(mockRoutine)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual({ success: true })
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'rt001' } })
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
    expect(mockDelete).not.toHaveBeenCalled()
  })

  test('throws 404 when routine belongs to another user', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...mockRoutine, userId: 'user999' })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Routine not found' })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockFindUnique.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to delete routine' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'DELETE /api/pt-routines/:id' }, '[DELETE /api/pt-routines/:id] Failed to delete routine')
    consoleSpy.mockRestore()
  })
})
