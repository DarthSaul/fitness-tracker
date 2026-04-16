/**
 * Tests for app/composables/useWorkoutSession.ts — saveWorkoutNotes
 *
 * Coverage strategy:
 *  - notesSaving starts false
 *  - No PATCH when session is null
 *  - PATCH is debounced by 800 ms; rapid calls coalesce to the last value
 *  - notesSaving is true while the PATCH is in-flight, false after it settles
 *  - session.notes is updated only after the PATCH resolves (not before)
 *    — this mirrors the page-level notesDraft contract: the textarea keeps
 *      the local draft until the server round-trip completes
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { useWorkoutSession } from './useWorkoutSession'

const mockFetch = $fetch as unknown as ReturnType<typeof vi.fn>

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

describe('useWorkoutSession — saveWorkoutNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('notesSaving is false initially', () => {
    const { notesSaving } = useWorkoutSession()
    expect(notesSaving.value).toBe(false)
  })

  test('does nothing when session is null', async () => {
    const { saveWorkoutNotes } = useWorkoutSession()
    saveWorkoutNotes('some text')
    vi.advanceTimersByTime(800)
    await Promise.resolve()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('PATCHes /api/workouts/:id after 800ms debounce', async () => {
    mockFetch.mockResolvedValueOnce({ id: 'session-1', notes: 'great workout' })
    const { session, saveWorkoutNotes } = useWorkoutSession()
    session.value = { ...baseSession }

    saveWorkoutNotes('great workout')
    expect(mockFetch).not.toHaveBeenCalled()

    vi.advanceTimersByTime(800)
    await Promise.resolve()

    expect(mockFetch).toHaveBeenCalledWith('/api/workouts/session-1', {
      method: 'PATCH',
      body: { notes: 'great workout' },
    })
  })

  test('notesSaving is true while PATCH is in-flight', async () => {
    let resolveFetch!: (val: unknown) => void
    mockFetch.mockReturnValueOnce(new Promise(res => { resolveFetch = res }))

    const { session, saveWorkoutNotes, notesSaving } = useWorkoutSession()
    session.value = { ...baseSession }

    saveWorkoutNotes('in-flight test')
    vi.advanceTimersByTime(800)
    // Timer callback runs synchronously up to `await $fetch()`; notesSaving is set before the await
    expect(notesSaving.value).toBe(true)

    resolveFetch({ id: 'session-1', notes: 'in-flight test' })
    await Promise.resolve()
    await Promise.resolve()

    expect(notesSaving.value).toBe(false)
  })

  test('session.notes is unchanged before PATCH resolves and updated after', async () => {
    let resolveFetch!: (val: unknown) => void
    mockFetch.mockReturnValueOnce(new Promise(res => { resolveFetch = res }))

    const { session, saveWorkoutNotes } = useWorkoutSession()
    session.value = { ...baseSession, notes: null }

    saveWorkoutNotes('my draft')
    vi.advanceTimersByTime(800)
    await Promise.resolve()

    // PATCH still in-flight — local draft has not leaked into session yet
    expect(session.value!.notes).toBeNull()

    resolveFetch({ id: 'session-1', notes: 'my draft' })
    await Promise.resolve()
    await Promise.resolve()

    // PATCH settled — session.notes now reflects the saved value
    expect(session.value!.notes).toBe('my draft')
  })

  test('rapid calls coalesce: only the last value is PATCHed', async () => {
    mockFetch.mockResolvedValue({ id: 'session-1', notes: 'final' })
    const { session, saveWorkoutNotes } = useWorkoutSession()
    session.value = { ...baseSession }

    saveWorkoutNotes('first')
    saveWorkoutNotes('second')
    saveWorkoutNotes('final')
    vi.advanceTimersByTime(800)
    await Promise.resolve()

    expect(mockFetch).toHaveBeenCalledOnce()
    expect(mockFetch).toHaveBeenCalledWith('/api/workouts/session-1', {
      method: 'PATCH',
      body: { notes: 'final' },
    })
  })

  test('notesSaving resets to false on PATCH failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'))

    const { session, saveWorkoutNotes, notesSaving } = useWorkoutSession()
    session.value = { ...baseSession }

    saveWorkoutNotes('draft')
    vi.advanceTimersByTime(800)
    await Promise.resolve()
    await Promise.resolve()

    expect(notesSaving.value).toBe(false)
  })
})
