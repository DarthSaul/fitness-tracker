/**
 * Tests for app/composables/useWorkoutSession.ts — session lifecycle and set actions
 *
 * Coverage strategy:
 *  - derived state: adHocGroups, progressPercent, completedSetCount, isSetCompleted/getCompletedSet
 *  - loadActiveSession / loadSession: populate state (split regular vs extra sets), 404 handling, rethrow
 *  - startWorkout: resets state, invalidates caches, maps 409/400/other to user-facing errors
 *  - recordSet / updateSet / deleteCompletedSet: URLs, bodies, state, guards, in-flight id reset
 *  - extra and ad-hoc sets: add / update / delete
 *  - completeWorkout / abandonWorkout: requests, cache invalidation, notes-timer cancellation
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, computed } from 'vue'
import { useWorkoutSession } from './useWorkoutSession'
import type { CompletedSetRecord } from '~/types/workout'

const mockFetch = $fetch as unknown as ReturnType<typeof vi.fn>
const mockClearNuxtData = vi.fn()

const baseSession = {
  id: 'session-1',
  userId: 'user-1',
  userProgramId: 'up-1',
  weekNumber: 1,
  dayNumber: 1,
  status: 'IN_PROGRESS' as const,
  startedAt: '2026-01-01T00:00:00Z',
  completedAt: null,
  notes: null,
}

function makeSet(overrides: Record<string, unknown>): CompletedSetRecord {
  return { id: 'cs', exerciseSetId: null, reps: 5, weight: 100, ...overrides } as unknown as CompletedSetRecord
}

function makeDay(setCount: number) {
  return {
    id: 'd1',
    exerciseGroups: [{
      id: 'g1',
      exercises: [{ id: 'pe1', sets: Array.from({ length: setCount }, (_, i) => ({ id: `s${i + 1}` })) }],
    }],
  }
}

function statusError(statusCode: number): Error {
  return Object.assign(new Error(`status ${statusCode}`), { statusCode })
}

const activeResponse = {
  session: {
    ...baseSession,
    completedSets: [
      makeSet({ id: 'cs1', exerciseSetId: 's1' }),
      makeSet({ id: 'cs2', exerciseSetId: null, adhocExerciseName: 'Curls' }),
    ],
    workoutExerciseSwaps: [{ id: 'sw1', programExerciseId: 'pe1' }],
  },
  day: makeDay(3),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('clearNuxtData', mockClearNuxtData)
  vi.stubGlobal('CACHE_KEYS', {
    ACTIVE_PROGRAM: 'active-program',
    ACTIVE_SESSIONS: 'active-sessions',
    ACTIVE_WORKOUT: 'active-workout',
  })
})

describe('useWorkoutSession — derived state', () => {
  beforeEach(() => {
    // Real reactivity: vitest.setup.ts computed stubs evaluate once
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('computed', computed)
  })

  afterEach(() => {
    vi.stubGlobal('ref', (val: unknown) => ({ value: val }))
    vi.stubGlobal('computed', (fn: () => unknown) => ({ value: fn() }))
  })

  test('progressPercent is 0 when there is no day', () => {
    const { progressPercent } = useWorkoutSession()
    expect(progressPercent.value).toBe(0)
  })

  test('progressPercent rounds completed over total and counts extra sets', () => {
    const { day, completedSets, extraCompletedSets, progressPercent, completedSetCount } = useWorkoutSession()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    day.value = makeDay(3) as any
    completedSets.value = new Map([['s1', makeSet({ id: 'cs1', exerciseSetId: 's1' })]])
    expect(progressPercent.value).toBe(33)

    extraCompletedSets.value = new Map([['x1', makeSet({ id: 'x1' })]])
    expect(completedSetCount.value).toBe(2)
    expect(progressPercent.value).toBe(67)
  })

  test('progressPercent never exceeds 100', () => {
    const { day, extraCompletedSets, completedSets, progressPercent } = useWorkoutSession()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    day.value = makeDay(1) as any
    completedSets.value = new Map([['s1', makeSet({ id: 'cs1', exerciseSetId: 's1' })]])
    extraCompletedSets.value = new Map([['x1', makeSet({ id: 'x1' })], ['x2', makeSet({ id: 'x2' })]])
    expect(progressPercent.value).toBe(100)
  })

  test('adHocGroups groups extra sets by exercise name and ignores sets without one', () => {
    const { extraCompletedSets, adHocGroups } = useWorkoutSession()
    extraCompletedSets.value = new Map([
      ['a', makeSet({ id: 'a', adhocExerciseName: 'Curls' })],
      ['b', makeSet({ id: 'b', adhocExerciseName: 'Dips' })],
      ['c', makeSet({ id: 'c', adhocExerciseName: 'Curls' })],
      ['d', makeSet({ id: 'd' })], // extra set on a program exercise, not ad hoc
    ])

    expect(adHocGroups.value.map(g => [g.exerciseName, g.sets.map(s => s.id)])).toEqual([
      ['Curls', ['a', 'c']],
      ['Dips', ['b']],
    ])
  })

  test('isSetCompleted and getCompletedSet look up by exercise set id', () => {
    const { completedSets, isSetCompleted, getCompletedSet } = useWorkoutSession()
    const record = makeSet({ id: 'cs1', exerciseSetId: 's1' })
    completedSets.value = new Map([['s1', record]])

    expect(isSetCompleted('s1')).toBe(true)
    expect(isSetCompleted('s2')).toBe(false)
    expect(getCompletedSet('s1')).toEqual(record)
    expect(getCompletedSet('s2')).toBeUndefined()
  })
})

describe('useWorkoutSession — loadActiveSession', () => {
  test('loads the active session, splitting regular and extra sets', async () => {
    mockFetch.mockResolvedValueOnce(activeResponse)
    const { session, day, completedSets, extraCompletedSets, exerciseSwaps, loadActiveSession } = useWorkoutSession()

    const found = await loadActiveSession()

    expect(mockFetch).toHaveBeenCalledWith('/api/workouts/active')
    expect(found).toBe(true)
    expect(session.value?.id).toBe('session-1')
    expect(day.value?.id).toBe('d1')
    expect([...completedSets.value.keys()]).toEqual(['s1'])
    expect([...extraCompletedSets.value.keys()]).toEqual(['cs2'])
    expect(exerciseSwaps.value).toHaveLength(1)
  })

  test('defaults swaps to an empty list when the response has none', async () => {
    mockFetch.mockResolvedValueOnce({
      session: { ...baseSession, completedSets: [] },
      day: makeDay(1),
    })
    const { exerciseSwaps, loadActiveSession } = useWorkoutSession()

    await loadActiveSession()

    expect(exerciseSwaps.value).toEqual([])
  })

  test('returns false on 404 (no active session)', async () => {
    mockFetch.mockRejectedValueOnce(statusError(404))
    const { session, loadActiveSession } = useWorkoutSession()

    expect(await loadActiveSession()).toBe(false)
    expect(session.value).toBeNull()
  })

  test('rethrows other errors', async () => {
    const boom = statusError(500)
    mockFetch.mockRejectedValueOnce(boom)
    const { loadActiveSession } = useWorkoutSession()

    await expect(loadActiveSession()).rejects.toBe(boom)
  })
})

describe('useWorkoutSession — loadSession', () => {
  test('loads a session by id, splitting regular and extra sets', async () => {
    mockFetch.mockResolvedValueOnce(activeResponse)
    const { session, completedSets, extraCompletedSets, exerciseSwaps, loadSession } = useWorkoutSession()

    const found = await loadSession('session-1')

    expect(mockFetch).toHaveBeenCalledWith('/api/workouts/session-1')
    expect(found).toBe(true)
    expect(session.value?.id).toBe('session-1')
    expect([...completedSets.value.keys()]).toEqual(['s1'])
    expect([...extraCompletedSets.value.keys()]).toEqual(['cs2'])
    expect(exerciseSwaps.value).toHaveLength(1)
  })

  test('defaults swaps to an empty list when the response has none', async () => {
    mockFetch.mockResolvedValueOnce({ session: { ...baseSession, completedSets: [] }, day: makeDay(1) })
    const { exerciseSwaps, loadSession } = useWorkoutSession()
    exerciseSwaps.value = [{ id: 'old' } as never]

    await loadSession('session-1')

    expect(exerciseSwaps.value).toEqual([])
  })

  test('clears all state and returns false on 404', async () => {
    mockFetch.mockResolvedValueOnce(activeResponse).mockRejectedValueOnce(statusError(404))
    const { session, day, completedSets, extraCompletedSets, exerciseSwaps, loadSession } = useWorkoutSession()
    await loadSession('session-1')

    expect(await loadSession('session-1')).toBe(false)

    expect(session.value).toBeNull()
    expect(day.value).toBeNull()
    expect(completedSets.value.size).toBe(0)
    expect(extraCompletedSets.value.size).toBe(0)
    expect(exerciseSwaps.value).toEqual([])
  })

  test('rethrows non-404 errors and keeps existing state', async () => {
    mockFetch.mockResolvedValueOnce(activeResponse)
    const { session, loadSession } = useWorkoutSession()
    await loadSession('session-1')
    const boom = statusError(500)
    mockFetch.mockRejectedValueOnce(boom)

    await expect(loadSession('session-1')).rejects.toBe(boom)
    expect(session.value?.id).toBe('session-1')
  })
})

describe('useWorkoutSession — startWorkout', () => {
  test('starts a workout, resets progress, invalidates caches and returns the id', async () => {
    mockFetch.mockResolvedValueOnce({ session: { ...baseSession, id: 'new-session' }, day: makeDay(2) })
    const { session, day, completedSets, extraCompletedSets, exerciseSwaps, loading, error, startWorkout } = useWorkoutSession()
    completedSets.value = new Map([['old', makeSet({ id: 'old' })]])
    extraCompletedSets.value = new Map([['old', makeSet({ id: 'old' })]])
    exerciseSwaps.value = [{ id: 'sw' } as never]

    const id = await startWorkout()

    expect(mockFetch).toHaveBeenCalledWith('/api/workouts', { method: 'POST' })
    expect(id).toBe('new-session')
    expect(session.value?.id).toBe('new-session')
    expect(day.value?.id).toBe('d1')
    expect(completedSets.value.size).toBe(0)
    expect(extraCompletedSets.value.size).toBe(0)
    expect(exerciseSwaps.value).toEqual([])
    expect(error.value).toBeNull()
    expect(loading.value).toBe(false)
    expect(mockClearNuxtData).toHaveBeenCalledWith('active-workout')
    expect(mockClearNuxtData).toHaveBeenCalledWith('active-program')
    expect(mockClearNuxtData).toHaveBeenCalledWith('active-sessions')
  })

  test.each([
    [409, 'A workout session is already in progress'],
    [400, 'No active program. Save and activate a program first.'],
    [500, 'Failed to start workout'],
  ])('sets a friendly error and rethrows on %i', async (statusCode, message) => {
    const boom = statusError(statusCode)
    mockFetch.mockRejectedValueOnce(boom)
    const { error, loading, session, startWorkout } = useWorkoutSession()

    await expect(startWorkout()).rejects.toBe(boom)

    expect(error.value).toBe(message)
    expect(loading.value).toBe(false)
    expect(session.value).toBeNull()
    expect(mockClearNuxtData).not.toHaveBeenCalled()
  })
})

describe('useWorkoutSession — recordSet', () => {
  test('does nothing without a session', async () => {
    const { recordSet } = useWorkoutSession()
    await recordSet('s1', { reps: 5 })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('POSTs the set and stores the returned record', async () => {
    const record = makeSet({ id: 'cs1', exerciseSetId: 's1', reps: 8, weight: 60 })
    mockFetch.mockResolvedValueOnce(record)
    const { session, completedSets, recordingSetId, recordSet } = useWorkoutSession()
    session.value = { ...baseSession }

    await recordSet('s1', { reps: 8, weight: 60 })

    expect(mockFetch).toHaveBeenCalledWith('/api/workouts/session-1/sets', {
      method: 'POST',
      body: { exerciseSetId: 's1', reps: 8, weight: 60 },
    })
    expect(completedSets.value.get('s1')).toBe(record)
    expect(recordingSetId.value).toBeNull()
  })

  test('tracks the in-flight set id while the request is pending', async () => {
    let resolveFetch!: (v: unknown) => void
    mockFetch.mockReturnValueOnce(new Promise((res) => { resolveFetch = res }))
    const { session, recordingSetId, recordSet } = useWorkoutSession()
    session.value = { ...baseSession }

    const pending = recordSet('s1', {})
    expect(recordingSetId.value).toBe('s1')

    resolveFetch(makeSet({ id: 'cs1', exerciseSetId: 's1' }))
    await pending
    expect(recordingSetId.value).toBeNull()
  })

  // Regression: a 409 used to return early without recording anything, so a set
  // logged elsewhere stayed "not done", and a set on a skipped exercise was
  // silently dropped.
  describe('on a 409', () => {
    test('a set the server already has (logged elsewhere) is synced and shown as done', async () => {
      const existing = makeSet({ id: 'cs-server', exerciseSetId: 's1', reps: 6, weight: 80 })
      mockFetch
        .mockRejectedValueOnce(statusError(409))
        .mockResolvedValueOnce({ ...activeResponse, session: { ...activeResponse.session, completedSets: [existing] } })
      const { session, completedSets, isSetCompleted, recordingSetId, recordSet } = useWorkoutSession()
      session.value = { ...baseSession }

      await expect(recordSet('s1', { reps: 5 })).resolves.toBeUndefined()

      expect(mockFetch).toHaveBeenLastCalledWith('/api/workouts/session-1')
      expect(isSetCompleted('s1')).toBe(true)
      // The server's record wins: it is what was actually saved.
      expect(completedSets.value.get('s1')).toBe(existing)
      expect(recordingSetId.value).toBeNull()
    })

    test('a 409 that left no set behind (e.g. the exercise is skipped) is rethrown, not swallowed', async () => {
      const conflict = statusError(409)
      mockFetch
        .mockRejectedValueOnce(conflict)
        .mockResolvedValueOnce({ ...activeResponse, session: { ...activeResponse.session, completedSets: [] } })
      const { session, isSetCompleted, recordingSetId, recordSet } = useWorkoutSession()
      session.value = { ...baseSession }

      await expect(recordSet('s1', { reps: 5 })).rejects.toBe(conflict)
      expect(isSetCompleted('s1')).toBe(false)
      expect(recordingSetId.value).toBeNull()
    })

    test('only the conflicting set is synced; other local state is left alone', async () => {
      const local = makeSet({ id: 'cs-local', exerciseSetId: 's2' })
      mockFetch
        .mockRejectedValueOnce(statusError(409))
        .mockResolvedValueOnce({ ...activeResponse, session: { ...activeResponse.session, completedSets: [makeSet({ id: 'cs-server', exerciseSetId: 's1' })] } })
      const { session, completedSets, recordSet } = useWorkoutSession()
      session.value = { ...baseSession }
      completedSets.value.set('s2', local)

      await recordSet('s1', {})

      expect(completedSets.value.get('s2')).toBe(local)
    })
  })

  test('rethrows other errors and resets the in-flight id', async () => {
    const boom = statusError(500)
    mockFetch.mockRejectedValueOnce(boom)
    const { session, completedSets, recordingSetId, recordSet } = useWorkoutSession()
    session.value = { ...baseSession }

    await expect(recordSet('s1', { reps: 5 })).rejects.toBe(boom)
    expect(completedSets.value.size).toBe(0)
    expect(recordingSetId.value).toBeNull()
  })
})

describe('useWorkoutSession — updateSet', () => {
  test('does nothing without a session or without a recorded set', async () => {
    const { session, updateSet } = useWorkoutSession()
    await updateSet('s1', { reps: 5 })
    session.value = { ...baseSession }
    await updateSet('s1', { reps: 5 })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('PATCHes the completed set by its record id and replaces it locally', async () => {
    const updated = makeSet({ id: 'cs1', exerciseSetId: 's1', reps: 10 })
    mockFetch.mockResolvedValueOnce(updated)
    const { session, completedSets, recordingSetId, updateSet } = useWorkoutSession()
    session.value = { ...baseSession }
    completedSets.value = new Map([['s1', makeSet({ id: 'cs1', exerciseSetId: 's1', reps: 5 })]])

    await updateSet('s1', { reps: 10 })

    expect(mockFetch).toHaveBeenCalledWith('/api/workouts/session-1/sets/cs1', { method: 'PATCH', body: { reps: 10 } })
    expect(completedSets.value.get('s1')).toBe(updated)
    expect(recordingSetId.value).toBeNull()
  })

  test('keeps the old record, resets the in-flight id and rethrows on failure', async () => {
    const boom = statusError(500)
    mockFetch.mockRejectedValueOnce(boom)
    const { session, completedSets, recordingSetId, updateSet } = useWorkoutSession()
    session.value = { ...baseSession }
    const original = makeSet({ id: 'cs1', exerciseSetId: 's1', reps: 5 })
    completedSets.value = new Map([['s1', original]])

    await expect(updateSet('s1', { reps: 10 })).rejects.toBe(boom)

    expect(completedSets.value.get('s1')).toBe(original)
    expect(recordingSetId.value).toBeNull()
  })
})

describe('useWorkoutSession — deleteCompletedSet', () => {
  test('does nothing without a session or without a recorded set', async () => {
    const { session, deleteCompletedSet } = useWorkoutSession()
    await deleteCompletedSet('s1')
    session.value = { ...baseSession }
    await deleteCompletedSet('s1')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('DELETEs the record and removes it locally', async () => {
    mockFetch.mockResolvedValueOnce({})
    const { session, completedSets, recordingSetId, deleteCompletedSet } = useWorkoutSession()
    session.value = { ...baseSession }
    completedSets.value = new Map([['s1', makeSet({ id: 'cs1', exerciseSetId: 's1' })]])

    await deleteCompletedSet('s1')

    expect(mockFetch).toHaveBeenCalledWith('/api/workouts/session-1/sets/cs1', { method: 'DELETE' })
    expect(completedSets.value.has('s1')).toBe(false)
    expect(recordingSetId.value).toBeNull()
  })

  test('keeps the set locally when the DELETE fails', async () => {
    const boom = statusError(500)
    mockFetch.mockRejectedValueOnce(boom)
    const { session, completedSets, recordingSetId, deleteCompletedSet } = useWorkoutSession()
    session.value = { ...baseSession }
    completedSets.value = new Map([['s1', makeSet({ id: 'cs1', exerciseSetId: 's1' })]])

    await expect(deleteCompletedSet('s1')).rejects.toBe(boom)

    expect(completedSets.value.has('s1')).toBe(true)
    expect(recordingSetId.value).toBeNull()
  })
})

describe('useWorkoutSession — extra and ad-hoc sets', () => {
  test('addExtraSet throws without a session', async () => {
    const { addExtraSet } = useWorkoutSession()
    await expect(addExtraSet('pe1')).rejects.toThrow('No active session')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('addExtraSet POSTs and stores the new set keyed by its id', async () => {
    const record = makeSet({ id: 'x1', reps: 12 })
    mockFetch.mockResolvedValueOnce(record)
    const { session, extraCompletedSets, addExtraSet } = useWorkoutSession()
    session.value = { ...baseSession }

    const result = await addExtraSet('pe1', { reps: 12 })

    expect(mockFetch).toHaveBeenCalledWith('/api/workouts/session-1/exercises/pe1/extra-sets', {
      method: 'POST',
      body: { reps: 12 },
    })
    expect(result).toBe(record)
    expect(extraCompletedSets.value.get('x1')).toBe(record)
  })

  test('addExtraSet defaults the body to an empty object', async () => {
    mockFetch.mockResolvedValueOnce(makeSet({ id: 'x1' }))
    const { session, addExtraSet } = useWorkoutSession()
    session.value = { ...baseSession }

    await addExtraSet('pe1')

    expect(mockFetch).toHaveBeenCalledWith('/api/workouts/session-1/exercises/pe1/extra-sets', { method: 'POST', body: {} })
  })

  test('addExtraSet leaves state untouched when the request fails', async () => {
    mockFetch.mockRejectedValueOnce(statusError(500))
    const { session, extraCompletedSets, addExtraSet } = useWorkoutSession()
    session.value = { ...baseSession }

    await expect(addExtraSet('pe1')).rejects.toThrow()
    expect(extraCompletedSets.value.size).toBe(0)
  })

  test('deleteExtraSet does nothing without a session', async () => {
    const { deleteExtraSet } = useWorkoutSession()
    await deleteExtraSet('x1')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('deleteExtraSet DELETEs and removes the set locally', async () => {
    mockFetch.mockResolvedValueOnce({})
    const { session, extraCompletedSets, deleteExtraSet } = useWorkoutSession()
    session.value = { ...baseSession }
    extraCompletedSets.value = new Map([['x1', makeSet({ id: 'x1' })]])

    await deleteExtraSet('x1')

    expect(mockFetch).toHaveBeenCalledWith('/api/workouts/session-1/extra-sets/x1', { method: 'DELETE' })
    expect(extraCompletedSets.value.has('x1')).toBe(false)
  })

  test('deleteExtraSet keeps the set when the request fails', async () => {
    mockFetch.mockRejectedValueOnce(statusError(500))
    const { session, extraCompletedSets, deleteExtraSet } = useWorkoutSession()
    session.value = { ...baseSession }
    extraCompletedSets.value = new Map([['x1', makeSet({ id: 'x1' })]])

    await expect(deleteExtraSet('x1')).rejects.toThrow()
    expect(extraCompletedSets.value.has('x1')).toBe(true)
  })

  test('updateExtraSet does nothing without a session or an existing extra set', async () => {
    const { session, updateExtraSet } = useWorkoutSession()
    await updateExtraSet('x1', { reps: 3 })
    session.value = { ...baseSession }
    await updateExtraSet('x1', { reps: 3 })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('updateExtraSet PATCHes the set and replaces it locally', async () => {
    const updated = makeSet({ id: 'x1', reps: 3 })
    mockFetch.mockResolvedValueOnce(updated)
    const { session, extraCompletedSets, recordingSetId, updateExtraSet } = useWorkoutSession()
    session.value = { ...baseSession }
    extraCompletedSets.value = new Map([['x1', makeSet({ id: 'x1', reps: 1 })]])

    await updateExtraSet('x1', { reps: 3 })

    expect(mockFetch).toHaveBeenCalledWith('/api/workouts/session-1/sets/x1', { method: 'PATCH', body: { reps: 3 } })
    expect(extraCompletedSets.value.get('x1')).toBe(updated)
    expect(recordingSetId.value).toBeNull()
  })

  test('updateExtraSet keeps the old set, resets the in-flight id and rethrows on failure', async () => {
    mockFetch.mockRejectedValueOnce(statusError(500))
    const { session, extraCompletedSets, recordingSetId, updateExtraSet } = useWorkoutSession()
    session.value = { ...baseSession }
    const original = makeSet({ id: 'x1', reps: 1 })
    extraCompletedSets.value = new Map([['x1', original]])

    await expect(updateExtraSet('x1', { reps: 3 })).rejects.toThrow()

    expect(extraCompletedSets.value.get('x1')).toBe(original)
    expect(recordingSetId.value).toBeNull()
  })

  test('addAdHocSet throws without a session', async () => {
    const { addAdHocSet } = useWorkoutSession()
    await expect(addAdHocSet('Curls')).rejects.toThrow('No active session')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('addAdHocSet POSTs the exercise name and stores the set', async () => {
    const record = makeSet({ id: 'ah1', adhocExerciseName: 'Curls' })
    mockFetch.mockResolvedValueOnce(record)
    const { session, extraCompletedSets, addAdHocSet } = useWorkoutSession()
    session.value = { ...baseSession }

    const result = await addAdHocSet('Curls')

    expect(mockFetch).toHaveBeenCalledWith('/api/workouts/session-1/ad-hoc-sets', {
      method: 'POST',
      body: { exerciseName: 'Curls' },
    })
    expect(result).toBe(record)
    expect(extraCompletedSets.value.get('ah1')).toBe(record)
  })
})

describe('useWorkoutSession — swapExercise guard', () => {
  test('does nothing without a session', async () => {
    const { swapExercise } = useWorkoutSession()
    await swapExercise('pe1', 'ex2')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('useWorkoutSession — completeWorkout', () => {
  test('throws without a session', async () => {
    const { completeWorkout } = useWorkoutSession()
    await expect(completeWorkout()).rejects.toThrow('No active session')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('PATCHes without a body by default, stores the result and invalidates caches', async () => {
    const completed = { ...baseSession, status: 'COMPLETED' as const, completedAt: '2026-01-01T01:00:00Z' }
    mockFetch.mockResolvedValueOnce({ session: completed })
    const { session, completing, completeWorkout } = useWorkoutSession()
    session.value = { ...baseSession }

    const result = await completeWorkout()

    expect(mockFetch).toHaveBeenCalledWith('/api/workouts/session-1/complete', { method: 'PATCH', body: undefined })
    expect(result.session).toBe(completed)
    expect(session.value).toBe(completed)
    expect(completing.value).toBe(false)
    expect(mockClearNuxtData).toHaveBeenCalledWith('active-workout')
    expect(mockClearNuxtData).toHaveBeenCalledWith('active-program')
    expect(mockClearNuxtData).toHaveBeenCalledWith('active-sessions')
  })

  test('sends an explicit completedAt (including null) in the body', async () => {
    mockFetch.mockResolvedValue({ session: baseSession })
    const { session, completeWorkout } = useWorkoutSession()
    session.value = { ...baseSession }

    await completeWorkout('2026-01-01T00:30:00Z')
    await completeWorkout(null)

    expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/workouts/session-1/complete', {
      method: 'PATCH',
      body: { completedAt: '2026-01-01T00:30:00Z' },
    })
    expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/workouts/session-1/complete', {
      method: 'PATCH',
      body: { completedAt: null },
    })
  })

  test('leaves the session and caches alone, resets completing and rethrows on failure', async () => {
    const boom = statusError(500)
    mockFetch.mockRejectedValueOnce(boom)
    const { session, completing, completeWorkout } = useWorkoutSession()
    session.value = { ...baseSession }

    await expect(completeWorkout()).rejects.toBe(boom)

    expect(session.value?.status).toBe('IN_PROGRESS')
    expect(completing.value).toBe(false)
    expect(mockClearNuxtData).not.toHaveBeenCalled()
  })
})

describe('useWorkoutSession — abandonWorkout', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('throws without a session', async () => {
    const { abandonWorkout } = useWorkoutSession()
    await expect(abandonWorkout()).rejects.toThrow('No active session')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('DELETEs the session, clears all local state and invalidates caches', async () => {
    mockFetch.mockResolvedValueOnce({ deleted: true })
    const { session, day, completedSets, extraCompletedSets, exerciseSwaps, abandoning, abandonWorkout } = useWorkoutSession()
    session.value = { ...baseSession }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    day.value = makeDay(2) as any
    completedSets.value = new Map([['s1', makeSet({ id: 'cs1', exerciseSetId: 's1' })]])
    extraCompletedSets.value = new Map([['x1', makeSet({ id: 'x1' })]])
    exerciseSwaps.value = [{ id: 'sw' } as never]

    await abandonWorkout()

    expect(mockFetch).toHaveBeenCalledWith('/api/workouts/session-1', { method: 'DELETE' })
    expect(session.value).toBeNull()
    expect(day.value).toBeNull()
    expect(completedSets.value.size).toBe(0)
    expect(extraCompletedSets.value.size).toBe(0)
    expect(exerciseSwaps.value).toEqual([])
    expect(abandoning.value).toBe(false)
    expect(mockClearNuxtData).toHaveBeenCalledWith('active-workout')
    expect(mockClearNuxtData).toHaveBeenCalledWith('active-program')
    expect(mockClearNuxtData).toHaveBeenCalledWith('active-sessions')
  })

  test('keeps the session and resets abandoning when the DELETE fails', async () => {
    const boom = statusError(500)
    mockFetch.mockRejectedValueOnce(boom)
    const { session, abandoning, abandonWorkout } = useWorkoutSession()
    session.value = { ...baseSession }

    await expect(abandonWorkout()).rejects.toBe(boom)

    expect(session.value?.id).toBe('session-1')
    expect(abandoning.value).toBe(false)
    expect(mockClearNuxtData).not.toHaveBeenCalled()
  })

  test('cancels a pending notes autosave so it cannot PATCH a deleted session', async () => {
    vi.useFakeTimers()
    mockFetch.mockResolvedValue({})
    const { session, saveWorkoutNotes, abandonWorkout } = useWorkoutSession()
    session.value = { ...baseSession }

    saveWorkoutNotes('draft')
    await abandonWorkout()
    await vi.advanceTimersByTimeAsync(1000)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith('/api/workouts/session-1', { method: 'DELETE' })
  })
})
