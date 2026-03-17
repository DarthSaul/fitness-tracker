/**
 * Tests for server/api/user-programs/[id]/activate.patch.ts
 *
 * Coverage strategy:
 *  - Happy path: activates program via $transaction, returns updated record
 *  - Validation: throws 400 when id param is missing/empty
 *  - Not found: throws 404 when user program doesn't exist
 *  - Ownership: throws 404 when user program belongs to another user
 *  - Already active: throws 409 when program is already active
 *  - Error propagation: throws 500 on unexpected error
 *  - H3 error pass-through: re-throws H3 errors without wrapping as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './activate.patch'

const mockFindUnique = (prisma as typeof prisma).userProgram.findUnique as ReturnType<typeof vi.fn>
const mockUpdateMany = (prisma as typeof prisma).userProgram.updateMany as ReturnType<typeof vi.fn>
const mockUpdate = (prisma as typeof prisma).userProgram.update as ReturnType<typeof vi.fn>
const mockTransaction = (prisma as typeof prisma).$transaction as ReturnType<typeof vi.fn>
const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(id = 'up001') {
  mockGetRouterParam.mockReturnValue(id)
  return { path: `/api/user-programs/${id}/activate`, context: { userId: 'user001' } }
}

const mockInactiveProgram = {
  id: 'up001',
  userId: 'user001',
  programId: 'prog001',
  isActive: false,
  currentWeek: 1,
  currentDay: 1,
  startedAt: new Date(),
}

const mockActivatedProgram = {
  ...mockInactiveProgram,
  isActive: true,
  program: { id: 'prog001', name: 'Brick House', description: 'A strength program' },
}

describe('PATCH /api/user-programs/:id/activate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    // Default $transaction mock: resolves the array of promises
    mockTransaction.mockImplementation((promises: Promise<unknown>[]) => Promise.all(promises))
  })

  test('activates program via $transaction and returns updated record', async () => {
    mockFindUnique.mockResolvedValueOnce(mockInactiveProgram)
    mockUpdateMany.mockResolvedValueOnce({ count: 1 })
    mockUpdate.mockResolvedValueOnce(mockActivatedProgram)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockActivatedProgram)
    expect(mockTransaction).toHaveBeenCalledOnce()
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user001', isActive: true },
      data: { isActive: false },
    })
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'up001' },
      data: { isActive: true },
      include: {
        program: { select: { id: true, name: true, description: true } },
      },
    })
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
    mockFindUnique.mockResolvedValueOnce({ ...mockInactiveProgram, userId: 'other-user' })

    const event = makeEvent('up001')
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'User program not found' })
  })

  test('throws 409 when program is already active', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...mockInactiveProgram, isActive: true })

    const event = makeEvent('up001')
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Program already active' })
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockFindUnique.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to activate program' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[PATCH /api/user-programs/:id/activate] Failed to activate program',
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
