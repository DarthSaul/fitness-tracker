import { describe, test, expect, vi, beforeEach } from 'vitest'
import { usePtRoutines } from './usePtRoutines'
import type { PtRoutine } from '~/types/pt-routine'

const mockUseFetch = useFetch as unknown as ReturnType<typeof vi.fn>
const mockFetch = $fetch as unknown as ReturnType<typeof vi.fn>

const mockRoutine: PtRoutine = {
  id: 'rt001',
  name: 'Knee Rehab',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  exercises: [
    { id: 'rtex001', ptRoutineId: 'rt001', order: 1, title: 'Clamshells', durationSeconds: null, reps: 15 },
  ],
}

function stubList(routines: PtRoutine[] | null) {
  const refresh = vi.fn()
  mockUseFetch.mockReturnValue({ data: ref(routines), status: ref('success'), refresh, error: ref(null) })
  return refresh
}

describe('usePtRoutines', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('fetches the routine list from /api/pt-routines', () => {
    stubList([mockRoutine])

    const { routines } = usePtRoutines()

    expect(mockUseFetch).toHaveBeenCalledWith('/api/pt-routines')
    expect(routines.value).toEqual([mockRoutine])
  })

  test('hasRoutines is true when the list is non-empty and false otherwise', () => {
    stubList([mockRoutine])
    expect(usePtRoutines().hasRoutines.value).toBe(true)

    stubList([])
    expect(usePtRoutines().hasRoutines.value).toBe(false)

    stubList(null)
    expect(usePtRoutines().hasRoutines.value).toBe(false)
  })

  test('createRoutine posts the payload and refreshes the list', async () => {
    const refresh = stubList([])
    mockFetch.mockResolvedValueOnce(mockRoutine)

    const { createRoutine } = usePtRoutines()
    await createRoutine('Knee Rehab', [{ title: 'Clamshells', durationSeconds: null, reps: 15 }])

    expect(mockFetch).toHaveBeenCalledWith('/api/pt-routines', {
      method: 'POST',
      body: { name: 'Knee Rehab', exercises: [{ title: 'Clamshells', durationSeconds: null, reps: 15 }] },
    })
    expect(refresh).toHaveBeenCalled()
  })

  test('updateRoutine patches the routine and refreshes the list', async () => {
    const refresh = stubList([mockRoutine])
    mockFetch.mockResolvedValueOnce(mockRoutine)

    const { updateRoutine } = usePtRoutines()
    await updateRoutine('rt001', { name: 'Hip Rehab', exercises: [{ title: 'Bridges', durationSeconds: null, reps: 12 }] })

    expect(mockFetch).toHaveBeenCalledWith('/api/pt-routines/rt001', {
      method: 'PATCH',
      body: { name: 'Hip Rehab', exercises: [{ title: 'Bridges', durationSeconds: null, reps: 12 }] },
    })
    expect(refresh).toHaveBeenCalled()
  })

  test('deleteRoutine deletes the routine and refreshes the list', async () => {
    const refresh = stubList([mockRoutine])
    mockFetch.mockResolvedValueOnce({ success: true })

    const { deleteRoutine } = usePtRoutines()
    await deleteRoutine('rt001')

    expect(mockFetch).toHaveBeenCalledWith('/api/pt-routines/rt001', { method: 'DELETE' })
    expect(refresh).toHaveBeenCalled()
  })

  test('createRoutine clears saving even when the request fails', async () => {
    stubList([])
    mockFetch.mockRejectedValueOnce(new Error('network error'))

    const { createRoutine, saving } = usePtRoutines()
    await expect(createRoutine('Knee Rehab', [])).rejects.toThrow('network error')

    expect(saving.value).toBe(false)
  })
})
