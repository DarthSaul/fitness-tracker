import { describe, test, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import type { ProgramSessionSummary } from '~/types/workout'
import { CACHE_KEYS } from './useAppCache'
import { useProgramManager } from './useProgramManager'

const mockFetch = $fetch as unknown as ReturnType<typeof vi.fn>
const mockUseFetch = useFetch as unknown as ReturnType<typeof vi.fn>
const mockClearNuxtData = vi.fn()
const mockRefreshSessions = vi.fn()

function session(week: number, day: number, status: ProgramSessionSummary['status']): ProgramSessionSummary {
  return { id: `s-${week}-${day}`, weekNumber: week, dayNumber: day, status, startedAt: '2026-06-01T00:00:00.000Z', completedAt: null, _count: { completedSets: 0 } }
}

const mockProgram = {
  id: 'up1',
  programId: 'prog1',
  currentWeek: 1,
  currentDay: 1,
  program: {
    id: 'prog1',
    name: 'Arm Farm',
    description: null,
    weeks: [
      {
        id: 'w1',
        weekNumber: 1,
        days: [
          {
            id: 'd1',
            dayNumber: 1,
            name: 'Push',
            exerciseGroups: [
              { exercises: [{ sets: [{ id: 'a' }, { id: 'b' }] }, { sets: [{ id: 'c' }] }] },
              { exercises: [{ sets: [{ id: 'd' }] }] },
            ],
          },
        ],
      },
    ],
  },
}

function setup(opts: {
  program?: typeof mockProgram | null
  sessions?: ProgramSessionSummary[] | null
  programStatus?: string
  sessionsStatus?: string
} = {}) {
  const sessions = opts.sessions === undefined ? [] : opts.sessions
  mockUseFetch.mockImplementation((url: string) => {
    if (url === '/api/user-programs/active') {
      return { data: ref(opts.program === undefined ? mockProgram : opts.program), status: ref(opts.programStatus ?? 'success') }
    }
    return {
      data: ref(sessions === null ? null : { sessions }),
      status: ref(opts.sessionsStatus ?? 'success'),
      refresh: mockRefreshSessions,
    }
  })
  return useProgramManager()
}

describe('useProgramManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // The global computed stub is non-reactive and evaluates once; use the real one.
    vi.stubGlobal('computed', computed)
    vi.stubGlobal('clearNuxtData', mockClearNuxtData)
    // Auto-imported in the app; the real constants keep the assertions honest.
    vi.stubGlobal('CACHE_KEYS', CACHE_KEYS)
  })

  test('fetches the active program and its sessions', () => {
    setup()

    expect(mockUseFetch).toHaveBeenCalledWith('/api/user-programs/active')
    expect(mockUseFetch).toHaveBeenCalledWith('/api/user-programs/active/sessions')
  })

  test('exposes an empty session list before sessions have loaded', () => {
    expect(setup({ sessions: null }).sessions.value).toEqual([])
  })

  test('reports loading while either request is pending', () => {
    expect(setup({ programStatus: 'pending' }).isLoading.value).toBe(true)
    expect(setup({ sessionsStatus: 'pending' }).isLoading.value).toBe(true)
    expect(setup().isLoading.value).toBe(false)
  })

  test('looks up the session for a given week and day', () => {
    const done = session(1, 1, 'COMPLETED')
    const { getSessionForDay } = setup({ sessions: [done, session(1, 2, 'IN_PROGRESS')] })

    expect(getSessionForDay(1, 1)).toEqual(done)
    expect(getSessionForDay(2, 1)).toBeUndefined()
  })

  test('classifies days by their session status', () => {
    const { isDayCompleted, isDayInProgress, isDayBeingEdited } = setup({
      sessions: [session(1, 1, 'COMPLETED'), session(1, 2, 'IN_PROGRESS'), session(1, 3, 'EDITING')],
    })

    expect(isDayCompleted(1, 1)).toBe(true)
    expect(isDayCompleted(1, 2)).toBe(false)
    expect(isDayInProgress(1, 2)).toBe(true)
    expect(isDayInProgress(1, 1)).toBe(false)
    expect(isDayBeingEdited(1, 3)).toBe(true)
    expect(isDayBeingEdited(1, 1)).toBe(false)
    expect(isDayBeingEdited(5, 5)).toBe(false)
  })

  test('counts every set across a day\'s exercise groups', () => {
    expect(setup().getTotalSetsForDay(1, 1)).toBe(4)
  })

  test('counts zero sets for an unknown week or day', () => {
    const { getTotalSetsForDay } = setup()

    expect(getTotalSetsForDay(9, 1)).toBe(0)
    expect(getTotalSetsForDay(1, 9)).toBe(0)
  })

  test('counts zero sets when there is no active program', () => {
    expect(setup({ program: null }).getTotalSetsForDay(1, 1)).toBe(0)
  })

  test('starts a retroactive session, invalidates caches, refreshes sessions and returns the new id', async () => {
    mockFetch.mockResolvedValue({ session: { id: 'new-session' } })
    const { startRetroactiveSession } = setup()

    const id = await startRetroactiveSession(2, 3)

    expect(mockFetch).toHaveBeenCalledWith('/api/workouts', { method: 'POST', body: { weekNumber: 2, dayNumber: 3 } })
    expect(mockClearNuxtData).toHaveBeenCalledWith(CACHE_KEYS.ACTIVE_WORKOUT)
    expect(mockClearNuxtData).toHaveBeenCalledWith(CACHE_KEYS.ACTIVE_PROGRAM)
    expect(mockClearNuxtData).toHaveBeenCalledWith(CACHE_KEYS.ACTIVE_SESSIONS)
    expect(mockRefreshSessions).toHaveBeenCalled()
    expect(id).toBe('new-session')
  })

  test('propagates a failed start without clearing caches or refreshing', async () => {
    mockFetch.mockRejectedValue(new Error('409'))
    const { startRetroactiveSession } = setup()

    await expect(startRetroactiveSession(1, 1)).rejects.toThrow('409')
    expect(mockClearNuxtData).not.toHaveBeenCalled()
    expect(mockRefreshSessions).not.toHaveBeenCalled()
  })
})
