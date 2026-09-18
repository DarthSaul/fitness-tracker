/**
 * Tests for app/composables/useWorkoutSession.ts — editing a finished session
 *
 * Coverage strategy:
 *  - updateCompletedAt: PATCHes the new day keeping the original time of day,
 *    skips no-op / malformed input, clamps to now, and leaves state alone on failure
 *  - swapExercise: reloads the session by id so it works outside the live workout
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { useWorkoutSession } from './useWorkoutSession'

const mockFetch = $fetch as unknown as ReturnType<typeof vi.fn>

const completedSession = {
  id: 'session-1',
  userId: 'user-1',
  userProgramId: 'up-1',
  weekNumber: 1,
  dayNumber: 1,
  status: 'COMPLETED' as const,
  startedAt: '2026-03-10T17:30:00.000Z',
  completedAt: '2026-03-10T18:30:00.000Z',
  notes: null,
}

function localDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('useWorkoutSession — updateCompletedAt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('PATCHes the new date, keeping the original time of day', async () => {
    mockFetch.mockResolvedValueOnce({})
    const { session, updateCompletedAt } = useWorkoutSession()
    session.value = { ...completedSession }

    const original = new Date(completedSession.completedAt)
    const expected = new Date(2026, 2, 8, original.getHours(), original.getMinutes(), original.getSeconds())

    await updateCompletedAt('2026-03-08')

    expect(mockFetch).toHaveBeenCalledWith('/api/workouts/session-1', {
      method: 'PATCH',
      body: { completedAt: expected.toISOString() },
    })
    expect(session.value?.completedAt).toBe(expected.toISOString())
  })

  test('does nothing when the date is unchanged', async () => {
    const { session, updateCompletedAt } = useWorkoutSession()
    session.value = { ...completedSession }

    await updateCompletedAt(localDateString(new Date(completedSession.completedAt)))

    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('does nothing for a blank or malformed date', async () => {
    const { session, updateCompletedAt } = useWorkoutSession()
    session.value = { ...completedSession }

    await updateCompletedAt('')
    await updateCompletedAt('not-a-date')

    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('does nothing when there is no session', async () => {
    const { updateCompletedAt } = useWorkoutSession()

    await updateCompletedAt('2026-03-08')

    expect(mockFetch).not.toHaveBeenCalled()
  })

  // The API rejects a future completedAt; picking "today" in the morning for a
  // workout originally logged in the evening must not trip that.
  test('clamps to now when the chosen day plus the original time is in the future', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 12, 9, 0, 0))
    mockFetch.mockResolvedValueOnce({})
    const { session, updateCompletedAt } = useWorkoutSession()
    session.value = { ...completedSession, completedAt: new Date(2026, 2, 10, 20, 0, 0).toISOString() }

    await updateCompletedAt('2026-03-12')

    expect(mockFetch).toHaveBeenCalledWith('/api/workouts/session-1', {
      method: 'PATCH',
      body: { completedAt: new Date(2026, 2, 12, 9, 0, 0).toISOString() },
    })
  })

  test('leaves the session untouched and rethrows when the PATCH fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom'))
    const { session, updateCompletedAt } = useWorkoutSession()
    session.value = { ...completedSession }

    await expect(updateCompletedAt('2026-03-08')).rejects.toThrow('boom')
    expect(session.value?.completedAt).toBe(completedSession.completedAt)
  })
})

describe('useWorkoutSession — swapExercise', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Reloading through /api/workouts/active 404s for a finished session, which
  // left the editor showing the pre-swap exercise.
  test('reloads the session by id, not through the active-session endpoint', async () => {
    mockFetch
      .mockResolvedValueOnce({}) // swap POST
      .mockResolvedValueOnce({
        session: { ...completedSession, completedSets: [], workoutExerciseSwaps: [{ programExerciseId: 'pe1' }] },
        day: { id: 'd1', exerciseGroups: [] },
      })
    const { session, exerciseSwaps, swapExercise } = useWorkoutSession()
    session.value = { ...completedSession }

    await swapExercise('pe1', 'ex2')

    expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/workouts/session-1/exercises/pe1/swap', {
      method: 'POST',
      body: { replacementExerciseId: 'ex2' },
    })
    expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/workouts/session-1')
    expect(exerciseSwaps.value).toHaveLength(1)
  })
})

describe('useWorkoutSession — loadSession ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function response(id: string) {
    return { session: { ...completedSession, id, completedSets: [], workoutExerciseSwaps: [] }, day: { id: `day-${id}`, exerciseGroups: [] } }
  }

  test('a slow earlier request does not overwrite a newer one', async () => {
    let resolveSlow: (v: unknown) => void = () => {}
    mockFetch
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSlow = resolve }))
      .mockResolvedValueOnce(response('new'))
    const { session, loadSession } = useWorkoutSession()

    const slow = loadSession('old')
    await loadSession('new')
    resolveSlow(response('old'))
    await slow

    expect(session.value?.id).toBe('new')
  })

  test('a stale 404 does not clear the session a newer request loaded', async () => {
    let rejectSlow: (e: unknown) => void = () => {}
    mockFetch
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectSlow = reject }))
      .mockResolvedValueOnce(response('new'))
    const { session, loadSession } = useWorkoutSession()

    const slow = loadSession('gone')
    await loadSession('new')
    rejectSlow(Object.assign(new Error('not found'), { statusCode: 404 }))
    await slow

    expect(session.value?.id).toBe('new')
  })

  test('the latest request still clears state on its own 404', async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error('not found'), { statusCode: 404 }))
    const { session, loadSession } = useWorkoutSession()
    session.value = { ...completedSession }

    expect(await loadSession('gone')).toBe(false)
    expect(session.value).toBeNull()
  })
})
