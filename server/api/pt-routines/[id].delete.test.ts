/**
 * Tests for server/api/pt-routines/[id].delete.ts
 *
 * Coverage strategy:
 *  - Happy path: atomically deletes the routine scoped to the owner
 *    (children cascade) and returns success
 *  - Validation: throws 400 when the routine ID is missing
 *  - Not found / ownership: throws 404 when nothing was deleted — the
 *    userId in the deleteMany filter covers both missing and other-user rows
 *  - Error propagation: throws 500 on unexpected error
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].delete'

const mockDeleteMany = (prisma as typeof prisma).ptRoutine.deleteMany as ReturnType<typeof vi.fn>
const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id: string = 'rt001') {
  mockGetRouterParam.mockReturnValue(id)
  return {
    path: `/api/pt-routines/${id}`,
    context: { userId: 'user001' },
  }
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

  test('deletes the routine scoped to the owner and returns success', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 1 })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual({ success: true })
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: 'rt001', userId: 'user001' } })
  })

  test('throws 400 when routine ID is missing', async () => {
    const event = makeEvent()
    mockGetRouterParam.mockReturnValue(undefined)
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing routine ID' })
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })

  test('throws 404 when routine does not exist', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 0 })

    const event = makeEvent('nonexistent')
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Routine not found' })
  })

  test('throws 404 when routine belongs to another user (userId scopes the delete)', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 0 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Routine not found' })
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: 'rt001', userId: 'user001' } })
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockDeleteMany.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to delete routine' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'DELETE /api/pt-routines/:id' }, '[DELETE /api/pt-routines/:id] Failed to delete routine')
    consoleSpy.mockRestore()
  })
})
