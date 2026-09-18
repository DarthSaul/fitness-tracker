/**
 * Tests for server/api/workouts/[id]/ad-hoc-sets.post.ts
 *
 * Coverage strategy:
 *  - Happy path: creates a blank ad-hoc set (trimmed name) and returns 201
 *  - Any status: works on IN_PROGRESS, EDITING and COMPLETED sessions — finished
 *    workouts are editable in isolation
 *  - Validation: 400 for missing id, missing/blank/non-string/over-long name
 *  - Ownership: 404 when the session is missing or belongs to another user
 *  - Error propagation: 500 on unexpected error
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './ad-hoc-sets.post'

const mockFindUniqueSession = (prisma as typeof prisma).workoutSession.findUnique as ReturnType<typeof vi.fn>
const mockCreateSet = (prisma as typeof prisma).completedSet.create as ReturnType<typeof vi.fn>
const mockGetRouterParam = getRouterParam as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockCreateError = createError as ReturnType<typeof vi.fn>

function makeEvent(body: unknown = { exerciseName: 'Face Pulls' }, id: string | undefined = 'ws001') {
  mockGetRouterParam.mockReturnValue(id)
  mockReadBody.mockResolvedValue(body)
  return {
    path: `/api/workouts/${id}/ad-hoc-sets`,
    context: { userId: 'user001' },
    node: { res: { statusCode: 200 } },
  }
}

const mockSession = { id: 'ws001', userId: 'user001', userProgramId: 'up001', status: 'IN_PROGRESS' }

const mockCompletedSet = {
  id: 'cs001',
  workoutSessionId: 'ws001',
  exerciseSetId: null,
  programExerciseId: null,
  adhocExerciseName: 'Face Pulls',
  reps: null,
  weight: null,
}

type Handler = (e: ReturnType<typeof makeEvent>) => Promise<unknown>

describe('POST /api/workouts/:id/ad-hoc-sets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateError.mockImplementation((opts: { statusCode: number; statusMessage: string }) => {
      const err = new Error(opts.statusMessage) as Error & { statusCode: number; statusMessage: string }
      err.statusCode = opts.statusCode
      err.statusMessage = opts.statusMessage
      return err
    })
  })

  test('creates a blank ad-hoc set with the trimmed name and returns 201', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(mockSession)
    mockCreateSet.mockResolvedValueOnce(mockCompletedSet)

    const event = makeEvent({ exerciseName: '  Face Pulls  ' })
    const result = await (handler as unknown as Handler)(event)

    expect(result).toEqual(mockCompletedSet)
    expect(event.node.res.statusCode).toBe(201)
    expect(mockCreateSet).toHaveBeenCalledWith({
      data: {
        workoutSessionId: 'ws001',
        exerciseSetId: null,
        programExerciseId: null,
        adhocExerciseName: 'Face Pulls',
        reps: null,
        weight: null,
      },
    })
  })

  test.each(['COMPLETED', 'EDITING'])('adds an ad-hoc set to a %s session', async (status) => {
    mockFindUniqueSession.mockResolvedValueOnce({ ...mockSession, status })
    mockCreateSet.mockResolvedValueOnce(mockCompletedSet)

    const event = makeEvent()
    const result = await (handler as unknown as Handler)(event)

    expect(result).toEqual(mockCompletedSet)
    expect(event.node.res.statusCode).toBe(201)
  })

  test('throws 400 when session id is missing', async () => {
    const event = makeEvent()
    mockGetRouterParam.mockReturnValue(undefined)

    await expect((handler as unknown as Handler)(event))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'Missing session ID' })
  })

  test.each([
    ['missing body', null],
    ['missing name', {}],
    ['blank name', { exerciseName: '   ' }],
    ['non-string name', { exerciseName: 42 }],
  ])('throws 400 on %s', async (_label, body) => {
    const event = makeEvent(body)

    await expect((handler as unknown as Handler)(event))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'exerciseName is required' })
    expect(mockFindUniqueSession).not.toHaveBeenCalled()
  })

  test('throws 400 when the name exceeds 200 characters', async () => {
    const event = makeEvent({ exerciseName: 'x'.repeat(201) })

    await expect((handler as unknown as Handler)(event))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'exerciseName must be 200 characters or less' })
  })

  test('throws 404 when the session does not exist', async () => {
    mockFindUniqueSession.mockResolvedValueOnce(null)

    const event = makeEvent()
    await expect((handler as unknown as Handler)(event))
      .rejects.toMatchObject({ statusCode: 404, statusMessage: 'Session not found' })
  })

  test('throws 404 when the session belongs to another user', async () => {
    mockFindUniqueSession.mockResolvedValueOnce({ ...mockSession, userId: 'other-user' })

    const event = makeEvent()
    await expect((handler as unknown as Handler)(event))
      .rejects.toMatchObject({ statusCode: 404, statusMessage: 'Session not found' })
    expect(mockCreateSet).not.toHaveBeenCalled()
  })

  test('throws 500 and logs on unexpected error', async () => {
    const dbError = new Error('connection reset')
    mockFindUniqueSession.mockRejectedValueOnce(dbError)

    const event = makeEvent()
    await expect((handler as unknown as Handler)(event))
      .rejects.toMatchObject({ statusCode: 500, statusMessage: 'Failed to create ad-hoc set' })
    expect(logger.error).toHaveBeenCalledWith(
      { err: dbError, route: 'POST /api/workouts/:id/ad-hoc-sets' },
      '[POST /api/workouts/:id/ad-hoc-sets] Failed to create ad-hoc set',
    )
  })
})
