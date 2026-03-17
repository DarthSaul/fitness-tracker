/**
 * Tests for server/api/user-programs/[id].delete.ts
 *
 * Coverage strategy:
 *  - Happy path: deletes user program and returns success
 *  - Validation: throws 400 when id param is missing/empty
 *  - Not found: throws 404 when user program doesn't exist
 *  - Ownership: throws 404 when user program belongs to another user
 *  - Error propagation: throws 500 on unexpected error
 *  - H3 error pass-through: re-throws H3 errors without wrapping as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './[id].delete'

const mockFindUnique = (prisma as typeof prisma).userProgram.findUnique as ReturnType<typeof vi.fn>
const mockDelete = (prisma as typeof prisma).userProgram.delete as ReturnType<typeof vi.fn>
const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id = 'up001') {
  mockGetRouterParam.mockReturnValue(id)
  return { path: `/api/user-programs/${id}`, context: { userId: 'user001' } }
}

const mockUserProgram = {
  id: 'up001',
  userId: 'user001',
  programId: 'prog001',
  isActive: false,
  currentWeek: 1,
  currentDay: 1,
  startedAt: new Date(),
}

describe('DELETE /api/user-programs/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('deletes user program and returns success', async () => {
    mockFindUnique.mockResolvedValueOnce(mockUserProgram)
    mockDelete.mockResolvedValueOnce(mockUserProgram)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual({ success: true })
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'up001' } })
  })

  test('throws 400 when id param is undefined', async () => {
    const event = makeEvent(undefined as unknown as string)
    mockGetRouterParam.mockReturnValue(undefined)

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing user program ID' })
  })

  test('throws 400 when id param is empty string', async () => {
    const event = makeEvent('')
    mockGetRouterParam.mockReturnValue('  ')

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing user program ID' })
  })

  test('throws 404 when user program does not exist', async () => {
    mockFindUnique.mockResolvedValueOnce(null)

    const event = makeEvent('up999')
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User program not found' })
  })

  test('throws 404 when user program belongs to another user', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...mockUserProgram, userId: 'other-user' })

    const event = makeEvent('up001')
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User program not found' })
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockFindUnique.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to delete user program' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[DELETE /api/user-programs/:id] Failed to delete user program',
      dbError,
    )
    consoleSpy.mockRestore()
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('User program not found') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'User program not found'
    mockFindUnique.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
