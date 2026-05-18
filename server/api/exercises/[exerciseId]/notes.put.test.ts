import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './notes.put'

const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockFindUniqueExercise = (prisma as typeof prisma).exercise.findUnique as ReturnType<typeof vi.fn>
const mockUpsertNote = (prisma as typeof prisma).userExerciseNote.upsert as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(exerciseId = 'ex001') {
  mockGetRouterParam.mockReturnValue(exerciseId)
  return {
    path: `/api/exercises/${exerciseId}/notes`,
    context: { userId: 'user001' },
  }
}

const mockExercise = { id: 'ex001' }

const mockNote = {
  userId: 'user001',
  exerciseId: 'ex001',
  notes: 'Keep elbows tucked on the way down',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('PUT /api/exercises/:exerciseId/notes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
    mockReadBody.mockResolvedValue({ notes: 'Keep elbows tucked on the way down' })
  })

  test('upserts note and returns the UserExerciseNote record', async () => {
    mockFindUniqueExercise.mockResolvedValueOnce(mockExercise)
    mockUpsertNote.mockResolvedValueOnce(mockNote)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<typeof mockNote>)(event)

    expect(result).toEqual(mockNote)
    expect(mockUpsertNote).toHaveBeenCalledWith({
      where: { userId_exerciseId: { userId: 'user001', exerciseId: 'ex001' } },
      create: { userId: 'user001', exerciseId: 'ex001', notes: 'Keep elbows tucked on the way down' },
      update: { notes: 'Keep elbows tucked on the way down' },
    })
  })

  test('creates a new note when none exists (upsert create path)', async () => {
    const newNote = { ...mockNote, notes: 'New note' }
    mockReadBody.mockResolvedValueOnce({ notes: 'New note' })
    mockFindUniqueExercise.mockResolvedValueOnce(mockExercise)
    mockUpsertNote.mockResolvedValueOnce(newNote)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<typeof mockNote>)(event)

    expect(result.notes).toBe('New note')
    expect(mockUpsertNote).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ notes: 'New note' }),
      }),
    )
  })

  test('updates existing note (upsert update path)', async () => {
    const updatedNote = { ...mockNote, notes: 'Updated cue' }
    mockReadBody.mockResolvedValueOnce({ notes: 'Updated cue' })
    mockFindUniqueExercise.mockResolvedValueOnce(mockExercise)
    mockUpsertNote.mockResolvedValueOnce(updatedNote)

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<typeof mockNote>)(event)

    expect(result.notes).toBe('Updated cue')
    expect(mockUpsertNote).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { notes: 'Updated cue' },
      }),
    )
  })

  test('throws 400 when exerciseId is missing', async () => {
    const event = makeEvent(undefined as unknown as string)
    mockGetRouterParam.mockReturnValue(undefined)

    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing exercise ID' })
  })

  test('throws 400 when notes is missing from body', async () => {
    mockReadBody.mockResolvedValueOnce({})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'notes must be a string' })
  })

  test('throws 400 when notes is not a string', async () => {
    mockReadBody.mockResolvedValueOnce({ notes: 123 })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'notes must be a string' })
  })

  test('throws 400 when notes exceeds 2000 characters', async () => {
    mockReadBody.mockResolvedValueOnce({ notes: 'x'.repeat(2001) })

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 400, statusMessage: 'notes must be 2000 characters or less' })
  })

  test('accepts notes at exactly 2000 characters', async () => {
    const longNotes = 'x'.repeat(2000)
    mockReadBody.mockResolvedValueOnce({ notes: longNotes })
    mockFindUniqueExercise.mockResolvedValueOnce(mockExercise)
    mockUpsertNote.mockResolvedValueOnce({ ...mockNote, notes: longNotes })

    const event = makeEvent()
    const result = await (handler as unknown as (e: typeof event) => Promise<typeof mockNote>)(event)

    expect(result.notes).toHaveLength(2000)
  })

  test('throws 404 when exercise not found', async () => {
    mockFindUniqueExercise.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 404, statusMessage: 'Exercise not found' })
  })

  test('re-throws H3 errors without wrapping as 500', async () => {
    const h3Error = new Error('Exercise not found') as Error & { statusCode: number; statusMessage: string }
    h3Error.statusCode = 404
    h3Error.statusMessage = 'Exercise not found'
    mockFindUniqueExercise.mockRejectedValueOnce(h3Error)

    const event = makeEvent()
    const thrown = await (handler as unknown as (e: typeof event) => Promise<unknown>)(event).catch((e: unknown) => e) as { statusCode: number }

    expect(thrown.statusCode).toBe(404)
    expect(mockCreateError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    )
  })

  test('wraps unknown errors as 500 and logs them', async () => {
    const dbError = new Error('connection reset')
    mockFindUniqueExercise.mockRejectedValueOnce(dbError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = makeEvent()
    await expect(
      (handler as unknown as (e: typeof event) => Promise<unknown>)(event),
    ).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to upsert exercise notes' })

    expect(logger.error).toHaveBeenCalledWith({ err: dbError, route: 'PUT /api/exercises/:exerciseId/notes' }, '[PUT /api/exercises/:exerciseId/notes] Failed to upsert exercise notes')
    consoleSpy.mockRestore()
  })
})
