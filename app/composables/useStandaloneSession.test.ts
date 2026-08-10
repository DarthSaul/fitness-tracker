import { describe, test, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import type { StandaloneCompletedSet } from '~/types/standalone'
import { useStandaloneSession } from './useStandaloneSession'

// The global ref/computed stubs are non-reactive placeholders; this composable
// derives values from mutated state, so it needs the real implementations.
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

const mockFetch = $fetch as unknown as ReturnType<typeof vi.fn>

function completedSet(overrides: Partial<StandaloneCompletedSet> = {}): StandaloneCompletedSet {
  return {
    id: 'cs1',
    standaloneWorkoutSessionId: 'sess1',
    standaloneWorkoutSetId: 'set1',
    adhocExerciseName: null,
    reps: 10,
    weight: 135,
    rpe: null,
    notes: null,
    completedAt: '2026-01-15T10:00:00.000Z',
    ...overrides,
  }
}

const workout = {
  id: 'w1',
  category: 'Full Body',
  order: 1,
  name: 'Hotel Room Blast',
  description: null,
  groups: [
    {
      id: 'g1',
      order: 1,
      type: 'STANDARD' as const,
      label: null,
      restSeconds: 90,
      exercises: [
        {
          id: 'e1',
          order: 1,
          exercise: { id: 'ex1', name: 'Push-up', description: null },
          sets: [
            { id: 'set1', setNumber: 1, reps: 10, weight: null, rpe: null, notes: null, effortTarget: null },
            { id: 'set2', setNumber: 2, reps: 10, weight: null, rpe: null, notes: null, effortTarget: null },
          ],
        },
      ],
    },
  ],
}

function sessionDetail(sets: StandaloneCompletedSet[] = []) {
  return {
    session: {
      id: 'sess1',
      userId: 'u1',
      standaloneWorkoutId: 'w1',
      status: 'IN_PROGRESS' as const,
      startedAt: '2026-01-15T09:00:00.000Z',
      completedAt: null,
      notes: null,
      completedSets: sets,
    },
    workout,
  }
}

describe('useStandaloneSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('loads a session and its template', async () => {
    mockFetch.mockResolvedValueOnce(sessionDetail())
    const s = useStandaloneSession()

    await s.loadSession('sess1')

    expect(mockFetch).toHaveBeenCalledWith('/api/standalone-workout-sessions/sess1')
    expect(s.workout.value?.name).toBe('Hotel Room Blast')
    expect(s.totalSets.value).toBe(2)
  })

  // Prescribed sets index by template id; anything else is an added exercise.
  test('separates prescribed sets from ad-hoc ones', async () => {
    mockFetch.mockResolvedValueOnce(sessionDetail([
      completedSet({ id: 'a', standaloneWorkoutSetId: 'set1' }),
      completedSet({ id: 'b', standaloneWorkoutSetId: null, adhocExerciseName: 'Plank' }),
    ]))
    const s = useStandaloneSession()

    await s.loadSession('sess1')

    expect(s.isSetCompleted('set1')).toBe(true)
    expect(s.adHocSets.value).toHaveLength(1)
    expect(s.completedSetCount.value).toBe(1)
  })

  test('reports progress against the prescribed set count', async () => {
    mockFetch.mockResolvedValueOnce(sessionDetail([completedSet({ standaloneWorkoutSetId: 'set1' })]))
    const s = useStandaloneSession()

    await s.loadSession('sess1')

    expect(s.progressPercent.value).toBe(50)
  })

  test('reports zero progress for an empty template rather than NaN', () => {
    const s = useStandaloneSession()
    expect(s.progressPercent.value).toBe(0)
  })

  test('surfaces a load failure without throwing', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'))
    const s = useStandaloneSession()

    await s.loadSession('sess1')

    expect(s.error.value).toBe('Failed to load workout')
    expect(s.loading.value).toBe(false)
  })

  test('starts a session and returns its id to navigate to', async () => {
    mockFetch.mockResolvedValueOnce({ session: { id: 'new-sess' } })
    const s = useStandaloneSession()

    await expect(s.startSession('w1')).resolves.toBe('new-sess')
    expect(mockFetch).toHaveBeenCalledWith('/api/standalone-workout-sessions', {
      method: 'POST',
      body: { standaloneWorkoutId: 'w1' },
    })
  })

  test('POSTs the first log for a set', async () => {
    mockFetch.mockResolvedValueOnce(sessionDetail())
    const s = useStandaloneSession()
    await s.loadSession('sess1')

    mockFetch.mockResolvedValueOnce(completedSet({ standaloneWorkoutSetId: 'set1' }))
    await s.recordSet('set1', { reps: 10, weight: 135 })

    expect(mockFetch).toHaveBeenLastCalledWith('/api/standalone-workout-sessions/sess1/sets', {
      method: 'POST',
      body: { standaloneWorkoutSetId: 'set1', reps: 10, weight: 135 },
    })
    expect(s.isSetCompleted('set1')).toBe(true)
  })

  // Re-POSTing would violate the (session, set) unique constraint.
  test('PATCHes an existing log instead of creating a second one', async () => {
    mockFetch.mockResolvedValueOnce(sessionDetail([completedSet({ id: 'cs1', standaloneWorkoutSetId: 'set1' })]))
    const s = useStandaloneSession()
    await s.loadSession('sess1')

    mockFetch.mockResolvedValueOnce(completedSet({ id: 'cs1', reps: 12 }))
    await s.recordSet('set1', { reps: 12, weight: 135 })

    expect(mockFetch).toHaveBeenLastCalledWith(
      '/api/standalone-workout-sessions/sess1/sets/cs1',
      { method: 'PATCH', body: { reps: 12, weight: 135 } },
    )
    expect(s.getCompletedSet('set1')?.reps).toBe(12)
  })

  test('clears the recording flag even when a log fails', async () => {
    mockFetch.mockResolvedValueOnce(sessionDetail())
    const s = useStandaloneSession()
    await s.loadSession('sess1')

    mockFetch.mockRejectedValueOnce(new Error('network error'))
    await expect(s.recordSet('set1', { reps: 1, weight: 1 })).rejects.toThrow()

    expect(s.recordingSetId.value).toBeNull()
  })

  test('removes a deleted set from the index', async () => {
    mockFetch.mockResolvedValueOnce(sessionDetail([completedSet({ id: 'cs1', standaloneWorkoutSetId: 'set1' })]))
    const s = useStandaloneSession()
    await s.loadSession('sess1')

    mockFetch.mockResolvedValueOnce({})
    await s.deleteSet('set1')

    expect(s.isSetCompleted('set1')).toBe(false)
  })

  test('completes the session', async () => {
    mockFetch.mockResolvedValueOnce(sessionDetail())
    const s = useStandaloneSession()
    await s.loadSession('sess1')

    mockFetch.mockResolvedValueOnce({})
    await s.completeSession()

    expect(mockFetch).toHaveBeenLastCalledWith(
      '/api/standalone-workout-sessions/sess1/complete',
      { method: 'PATCH' },
    )
    expect(s.completing.value).toBe(false)
  })

  test('abandons the session', async () => {
    mockFetch.mockResolvedValueOnce(sessionDetail())
    const s = useStandaloneSession()
    await s.loadSession('sess1')

    mockFetch.mockResolvedValueOnce({})
    await s.abandonSession()

    expect(mockFetch).toHaveBeenLastCalledWith('/api/standalone-workout-sessions/sess1', {
      method: 'DELETE',
    })
  })

  test('does nothing when there is no loaded session', async () => {
    const s = useStandaloneSession()

    await s.recordSet('set1', { reps: 1, weight: 1 })
    await s.completeSession()
    await s.abandonSession()

    expect(mockFetch).not.toHaveBeenCalled()
  })
})
