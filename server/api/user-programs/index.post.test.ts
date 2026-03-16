/**
 * Tests for server/api/user-programs/index.post.ts
 *
 * Coverage strategy:
 *  - Happy path: creates user program and returns 201
 *  - Validation: throws 400 when programId is missing or empty
 *  - Not found: throws 404 when program doesn't exist
 *  - Duplicate: throws 409 when program already saved
 *  - Error propagation: throws 500 on unexpected error
 *  - H3 error pass-through: re-throws H3 errors without wrapping as 500
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './index.post'

const mockProgramFindUnique = (prisma as typeof prisma).program.findUnique as ReturnType<typeof vi.fn>
const mockFindFirst = (prisma as typeof prisma).userProgram.findFirst as ReturnType<typeof vi.fn>
const mockCreate = (prisma as typeof prisma).userProgram.create as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(body: unknown = { programId: 'prog001' }) {
  mockReadBody.mockResolvedValue(body)
  return {
    path: '/api/user-programs',
    context: { userId: 'user001' },
    node: { res: { statusCode: 200 } },
  }
}

const mockCreatedProgram = {
  id: 'up001',
  userId: 'user001',
  programId: 'prog001',
  isActive: false,
  currentWeek: 1,
  currentDay: 1,
  startedAt: new Date(),
  program: { id: 'prog001', name: 'Brick House', description: 'A strength program' },
}

describe('POST /api/user-programs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('creates user program and returns it', async () => {
    mockProgramFindUnique.mockResolvedValueOnce({ id: 'prog001', name: 'Brick House' })
    mockFindFirst.mockResolvedValueOnce(null)
    mockCreate.mockResolvedValueOnce(mockCreatedProgram)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event)

    expect(result).toEqual(mockCreatedProgram)
    expect(event.node.res.statusCode).toBe(201)
    expect(mockCreate).toHaveBeenCalledWith({
      data: { userId: 'user001', programId: 'prog001' },
      include: {
        program: { select: { id: true, name: true, description: true } },
      },
    })
  })

  test('throws 400 when programId is missing', async () => {
    const event = makeEvent({})
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing programId' })
  })

  test('throws 400 when programId is empty string', async () => {
    const event = makeEvent({ programId: '  ' })
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing programId' })
  })

  test('throws 400 when body is null', async () => {
    const event = makeEvent(null)
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing programId' })
  })

  test('throws 404 when program does not exist', async () => {
    mockProgramFindUnique.mockResolvedValueOnce(null)

    const event = makeEvent({ programId: 'nonexistent' })
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Program not found' })
  })

  test('throws 409 when program already saved', async () => {
    mockProgramFindUnique.mockResolvedValueOnce({ id: 'prog001', name: 'Brick House' })
    mockFindFirst.mockResolvedValueOnce({ id: 'up001' })

    const event = makeEvent({ programId: 'prog001' })
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Program already saved' })
  })

  test('throws 500 on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockProgramFindUnique.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to save program' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[POST /api/user-programs] Failed to save program',
      dbError,
    )
    consoleSpy.mockRestore()
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('Program not found') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'Program not found'
    mockProgramFindUnique.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })
})
