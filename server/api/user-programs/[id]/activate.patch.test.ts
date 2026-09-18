/**
 * Tests for server/api/user-programs/[id]/activate.patch.ts
 *
 * Coverage strategy:
 *  - Happy path: activates program via $transaction, returns updated record
 *  - Validation: throws 400 when id param is missing/empty
 *  - Not found: throws 404 when user program doesn't exist
 *  - Ownership: throws 404 when user program belongs to another user
 *  - Already active: throws 409 when program is already active
 *  - Runs: a completed/archived row is never resumed — activation resolves to
 *    the program's open run, creating a fresh one (week 1, day 1) when needed
 *  - Races: P2002 from the partial unique indexes surfaces as 409
 *  - Error propagation: throws 500 on unexpected error
 *  - H3 error pass-through: re-throws H3 errors without wrapping as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './activate.patch'

const mockFindUnique = (prisma as typeof prisma).userProgram.findUnique as ReturnType<typeof vi.fn>
const mockUpdateMany = (prisma as typeof prisma).userProgram.updateMany as ReturnType<typeof vi.fn>
const mockUpdate = (prisma as typeof prisma).userProgram.update as ReturnType<typeof vi.fn>
const mockFindFirst = (prisma as typeof prisma).userProgram.findFirst as ReturnType<typeof vi.fn>
const mockCreate = (prisma as typeof prisma).userProgram.create as ReturnType<typeof vi.fn>
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
  completedAt: null,
  archivedAt: null,
}

const programInclude = { program: { select: { id: true, name: true, description: true } } }

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
    // Interactive $transaction: run the callback with the prisma stub as `tx`
    mockTransaction.mockImplementation((fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma))
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

  // Regression: a user finished a program, re-activated it, and was dropped back
  // on the final day instead of week one because the completed row was resumed.
  test('activating a completed run creates a fresh run instead of resuming it', async () => {
    const completedRun = { ...mockInactiveProgram, currentWeek: 12, currentDay: 4, completedAt: new Date('2026-06-01') }
    const freshRun = { ...mockActivatedProgram, id: 'up002', currentWeek: 1, currentDay: 1 }
    mockFindUnique.mockResolvedValueOnce(completedRun)
    mockFindFirst.mockResolvedValueOnce(null)
    mockUpdateMany.mockResolvedValueOnce({ count: 0 })
    mockCreate.mockResolvedValueOnce(freshRun)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ id: string }>)(event)

    expect(result).toEqual(freshRun)
    expect(result.id).not.toBe('up001')
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { userId: 'user001', programId: 'prog001', completedAt: null, archivedAt: null },
    })
    expect(mockCreate).toHaveBeenCalledWith({
      data: { userId: 'user001', programId: 'prog001', isActive: true },
      include: programInclude,
    })
    // The finished run is history — never mutated
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test('activating an archived run creates a fresh run', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...mockInactiveProgram, archivedAt: new Date('2026-06-01') })
    mockFindFirst.mockResolvedValueOnce(null)
    mockCreate.mockResolvedValueOnce({ ...mockActivatedProgram, id: 'up002' })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ id: string }>)(event)

    expect(result.id).toBe('up002')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test('a completed run that was re-activated by an older deploy still restarts', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...mockInactiveProgram, isActive: true, completedAt: new Date('2026-06-01') })
    mockFindFirst.mockResolvedValueOnce(null)
    mockCreate.mockResolvedValueOnce({ ...mockActivatedProgram, id: 'up002' })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ id: string }>)(event)

    expect(result.id).toBe('up002')
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user001', isActive: true },
      data: { isActive: false },
    })
  })

  test('activating a terminal run resumes the existing open run for that program', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...mockInactiveProgram, completedAt: new Date('2026-06-01') })
    mockFindFirst.mockResolvedValueOnce({ ...mockInactiveProgram, id: 'up002', currentWeek: 3 })
    mockUpdate.mockResolvedValueOnce({ ...mockActivatedProgram, id: 'up002', currentWeek: 3 })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ id: string }>)(event)

    expect(result.id).toBe('up002')
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'up002' }, data: { isActive: true }, include: programInclude })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('throws 409 when a terminal run already has an active open run', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...mockInactiveProgram, completedAt: new Date('2026-06-01') })
    mockFindFirst.mockResolvedValueOnce({ ...mockInactiveProgram, id: 'up002', isActive: true })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Program already active' })
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })

  test('throws 409 when a concurrent activation wins the race (P2002)', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...mockInactiveProgram, completedAt: new Date('2026-06-01') })
    mockFindFirst.mockResolvedValueOnce(null)
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Program already active' })
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

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'PATCH /api/user-programs/:id/activate' }, '[PATCH /api/user-programs/:id/activate] Failed to activate program')
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
