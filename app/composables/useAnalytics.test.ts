import { describe, test, expect, vi, beforeEach } from 'vitest'
import { useAnalytics, type AnalyticsExerciseHistory } from './useAnalytics'

const mockFetch = $fetch as unknown as ReturnType<typeof vi.fn>

function makeHistory(exerciseId: string, name: string): AnalyticsExerciseHistory {
  return { exercise: { id: exerciseId, name }, history: [] }
}

describe('useAnalytics — selectExercise', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('toggling: calling selectExercise with the currently selected id clears state', async () => {
    mockFetch.mockResolvedValueOnce(makeHistory('ex1', 'Bench Press'))

    const { selectExercise, selectedExerciseId, exerciseHistory, historyStatus } = useAnalytics()

    await selectExercise('ex1')
    expect(selectedExerciseId.value).toBe('ex1')
    expect(historyStatus.value).toBe('success')

    await selectExercise('ex1')
    expect(selectedExerciseId.value).toBeNull()
    expect(exerciseHistory.value).toBeNull()
    expect(historyStatus.value).toBe('idle')
  })

  test('successful fetch: sets exerciseHistory and historyStatus to success', async () => {
    const history = makeHistory('ex1', 'Squat')
    mockFetch.mockResolvedValueOnce(history)

    const { selectExercise, selectedExerciseId, exerciseHistory, historyStatus } = useAnalytics()

    await selectExercise('ex1')

    expect(selectedExerciseId.value).toBe('ex1')
    expect(exerciseHistory.value).toEqual(history)
    expect(historyStatus.value).toBe('success')
  })

  test('successful fetch: calls $fetch with encoded exercise id', async () => {
    mockFetch.mockResolvedValueOnce(makeHistory('ex1', 'Bench Press'))

    const { selectExercise } = useAnalytics()
    await selectExercise('ex1')

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/analytics/exercises/${encodeURIComponent('ex1')}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  test('error handling: sets historyStatus to error and leaves exerciseHistory null', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'))

    const { selectExercise, exerciseHistory, historyStatus } = useAnalytics()

    await selectExercise('ex1')

    expect(exerciseHistory.value).toBeNull()
    expect(historyStatus.value).toBe('error')
  })

  test('rapid reselection: last call wins — earlier response is discarded', async () => {
    let resolveFirst!: (v: AnalyticsExerciseHistory) => void
    const firstPromise = new Promise<AnalyticsExerciseHistory>((r) => { resolveFirst = r })
    const secondResult = makeHistory('ex2', 'Squat')

    mockFetch
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce(secondResult)

    const { selectExercise, selectedExerciseId, exerciseHistory, historyStatus } = useAnalytics()

    // Start first call (for ex1), do not await it yet
    const p1 = selectExercise('ex1')

    // Immediately start second call (for ex2) before first resolves
    const p2 = selectExercise('ex2')
    await p2

    // Resolve the first (stale) response after the second has settled
    resolveFirst(makeHistory('ex1', 'Bench Press'))
    await p1

    // Final state must reflect the last selection (ex2)
    expect(selectedExerciseId.value).toBe('ex2')
    expect(exerciseHistory.value).toEqual(secondResult)
    expect(historyStatus.value).toBe('success')
  })
})
