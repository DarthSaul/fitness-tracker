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

  test('treats a missing list as nothing saved and nothing active', () => {
    mockUseFetch.mockReturnValueOnce({ data: { value: null }, refresh: mockRefresh, status: { value: 'pending' } })
    const { isSaved, isActive, isCompleted, hasActiveProgram, status } = useUserPrograms()

    expect(isSaved('prog1')).toBe(false)
    expect(isActive('prog1')).toBe(false)
    expect(isCompleted('prog1')).toBe(false)
    expect(hasActiveProgram.value).toBe(false)
    expect(status.value).toBe('pending')
  })

  test('reports an open active run as active', () => {
    const { isActive, hasActiveProgram } = setup([run('up1', { isActive: true })])

    expect(isActive('prog1')).toBe(true)
    expect(hasActiveProgram.value).toBe(true)
  })

  test('saves an unsaved program and refreshes the list', async () => {
    const { toggleSave } = setup([])

    await toggleSave('prog1')

    expect(mockFetch).toHaveBeenCalledWith('/api/user-programs', { method: 'POST', body: { programId: 'prog1' } })
    expect(mockRefresh).toHaveBeenCalled()
  })

  test('unsaves a saved program by its run id and refreshes the list', async () => {
    const { toggleSave } = setup([run('up1')])

    await toggleSave('prog1')

    expect(mockFetch).toHaveBeenCalledWith('/api/user-programs/up1', { method: 'DELETE' })
    expect(mockRefresh).toHaveBeenCalled()
  })

  test('marks a program as saving while the request is in flight and ignores repeat taps', async () => {
    let resolve!: () => void
    mockFetch.mockReturnValueOnce(new Promise<void>((r) => { resolve = r }))
    const { toggleSave, isSaving } = setup([])

    const first = toggleSave('prog1')
    expect(isSaving('prog1')).toBe(true)
    await toggleSave('prog1')
    expect(mockFetch).toHaveBeenCalledTimes(1)

    resolve()
    await first
    expect(isSaving('prog1')).toBe(false)
  })

  test('stops showing saving and skips the refresh when the save request fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('409'))
    const { toggleSave, isSaving } = setup([])

    await expect(toggleSave('prog1')).rejects.toThrow('409')

    expect(isSaving('prog1')).toBe(false)
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  test('deactivates the active program and refreshes the list', async () => {
    const { toggleActive } = setup([run('up1', { isActive: true })])

    await toggleActive('prog1')

    expect(mockFetch).toHaveBeenCalledWith('/api/user-programs/up1/deactivate', { method: 'PATCH' })
    expect(mockRefresh).toHaveBeenCalled()
    expect(mockToastAdd).not.toHaveBeenCalled()
  })

  test('activates a saved program when nothing else is active', async () => {
    const { toggleActive } = setup([run('up1')])

    await toggleActive('prog1')

    expect(mockFetch).toHaveBeenCalledWith('/api/user-programs/up1/activate', { method: 'PATCH' })
    expect(mockRefresh).toHaveBeenCalled()
  })

  test('does nothing when toggling activation of a program that is not saved', async () => {
    const { toggleActive } = setup([])

    await toggleActive('prog1')

    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockToastAdd).not.toHaveBeenCalled()
  })

  test('marks a program as activating while the request is in flight and ignores repeat taps', async () => {
    let resolve!: () => void
    mockFetch.mockReturnValueOnce(new Promise<void>((r) => { resolve = r }))
    const { toggleActive, isActivating } = setup([run('up1')])

    const first = toggleActive('prog1')
    expect(isActivating('prog1')).toBe(true)
    await toggleActive('prog1')
    expect(mockFetch).toHaveBeenCalledTimes(1)

    resolve()
    await first
    expect(isActivating('prog1')).toBe(false)
  })

  test('stops showing activating when activation fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('500'))
    const { toggleActive, isActivating } = setup([run('up1')])

    await expect(toggleActive('prog1')).rejects.toThrow('500')

    expect(isActivating('prog1')).toBe(false)
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  test('stops showing activating when deactivation fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('500'))
    const { toggleActive, isActivating } = setup([run('up1', { isActive: true })])

    await expect(toggleActive('prog1')).rejects.toThrow('500')

    expect(isActivating('prog1')).toBe(false)
  })
})
