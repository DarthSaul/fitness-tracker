import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './notes.get'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockFindUniqueNote = (prisma as typeof prisma).userExerciseNote.findUnique as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(exerciseId = 'ex001') {
  mockGetRouterParam.mockReturnValue(exerciseId)
  return {
    path: `/api/exercises/${exerciseId}/notes`,
    context: { userId: 'user001' },
  }
}

describe('GET /api/exercises/:exerciseId/notes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('returns { notes: "..." } when a note exists for this user and exercise', async () => {
    mockFindUniqueNote.mockResolvedValueOnce({
      userId: 'user001',
      exerciseId: 'ex001',
      notes: 'Keep elbows tucked',
    })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ notes: string | null }>)(event)

    expect(result).toEqual({ notes: 'Keep elbows tucked' })
    expect(mockFindUniqueNote).toHaveBeenCalledWith({
      where: { userId_exerciseId: { userId: 'user001', exerciseId: 'ex001' } },
    })
  })

  test('returns { notes: null } when no note exists for this user', async () => {
    mockFindUniqueNote.mockResolvedValueOnce(null)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<{ notes: string | null }>)(event)

    expect(result).toEqual({ notes: null })
  })

  test('throws 400 when exerciseId is missing', async () => {
    const event = makeEvent(undefined as unknown as string)
    mockGetRouterParam.mockReturnValue(undefined)

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing exercise ID' })
  })

  test('throws 400 when exerciseId is whitespace only', async () => {
    const event = makeEvent('   ')
    mockGetRouterParam.mockReturnValue('   ')

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing exercise ID' })
  })

  test('throws 500 on database error and logs it', async () => {
    const dbError = new Error('connection reset')
    mockFindUniqueNote.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to fetch exercise notes' })

    expect(consoleSpy).toHaveBeenCalledWith(
      '[GET /api/exercises/:exerciseId/notes] Failed to fetch exercise notes',
      dbError,
    )
    consoleSpy.mockRestore()
  })
})
