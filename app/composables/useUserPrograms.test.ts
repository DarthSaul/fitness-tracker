import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { UserProgramSummary } from '~/types/user-program'
import { useUserPrograms } from './useUserPrograms'

const mockFetch = $fetch as unknown as ReturnType<typeof vi.fn>
const mockUseFetch = useFetch as unknown as ReturnType<typeof vi.fn>
const mockRefresh = vi.fn()
const mockToastAdd = vi.fn()

function run(id: string, extra: Partial<UserProgramSummary> = {}): UserProgramSummary {
  return {
    id,
    programId: 'prog1',
    isActive: false,
    currentWeek: 1,
    currentDay: 1,
    completedAt: null,
    archivedAt: null,
    runNumber: 1,
    completedRunCount: 0,
    program: { id: 'prog1', name: 'Arm Farm', description: null },
    ...extra,
  }
}

/** The global `computed` stub evaluates once, so data must be in place before the composable is created. */
function setup(rows: UserProgramSummary[]) {
  mockUseFetch.mockReturnValueOnce({ data: { value: rows }, refresh: mockRefresh, status: { value: 'success' } })
  return useUserPrograms()
}

describe('useUserPrograms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('useToast', () => ({ add: mockToastAdd }))
  })

  test('a completed run counts as saved and completed, not active', () => {
    const { isSaved, isActive, isCompleted } = setup([run('up1', { completedAt: '2026-06-01T00:00:00.000Z' })])

    expect(isSaved('prog1')).toBe(true)
    expect(isCompleted('prog1')).toBe(true)
    expect(isActive('prog1')).toBe(false)
  })

  test('an open run is not completed', () => {
    const { isCompleted } = setup([run('up1', { isActive: true })])

    expect(isCompleted('prog1')).toBe(false)
  })

  // The API collapses to one run per program, but if several ever arrive the
  // open run must win — it is the one Start/Save should act on.
  test('prefers the open run when several runs of one program arrive', async () => {
    const { isCompleted, toggleActive } = setup([
      run('up-open', { runNumber: 2 }),
      run('up-done', { completedAt: '2026-06-01T00:00:00.000Z' }),
    ])

    expect(isCompleted('prog1')).toBe(false)
    await toggleActive('prog1')
    expect(mockFetch).toHaveBeenCalledWith('/api/user-programs/up-open/activate', { method: 'PATCH' })
  })

  test('starting a completed program again activates it and refreshes to pick up the new run', async () => {
    const { toggleActive } = setup([run('up-done', { completedAt: '2026-06-01T00:00:00.000Z' })])

    await toggleActive('prog1')

    expect(mockFetch).toHaveBeenCalledWith('/api/user-programs/up-done/activate', { method: 'PATCH' })
    expect(mockRefresh).toHaveBeenCalled()
  })

  // A finished run an older deploy left flagged active must restart, not deactivate
  test('a completed run still flagged active is restarted rather than deactivated', async () => {
    const { toggleActive, isActive } = setup([run('up-done', { isActive: true, completedAt: '2026-06-01T00:00:00.000Z' })])

    expect(isActive('prog1')).toBe(false)
    await toggleActive('prog1')

    expect(mockFetch).toHaveBeenCalledWith('/api/user-programs/up-done/activate', { method: 'PATCH' })
  })

  test('blocks starting a program while another is active', async () => {
    const { toggleActive } = setup([
      run('up1', { completedAt: '2026-06-01T00:00:00.000Z' }),
      run('up2', { programId: 'prog2', isActive: true }),
    ])

    await toggleActive('prog1')

    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockToastAdd).toHaveBeenCalled()
  })
})
