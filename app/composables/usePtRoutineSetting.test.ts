import { describe, test, expect, vi, beforeEach } from 'vitest'
import { usePtRoutineSetting } from './usePtRoutineSetting'

const mockUseFetch = useFetch as unknown as ReturnType<typeof vi.fn>
const mockFetch = $fetch as unknown as ReturnType<typeof vi.fn>

function stubMe(me: { ptRoutineInWorkout: boolean } | null) {
  const refresh = vi.fn()
  mockUseFetch.mockReturnValue({ data: ref(me), status: ref('success'), refresh, error: ref(null) })
  return refresh
}

describe('usePtRoutineSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('fetches the profile from /api/auth/me', () => {
    stubMe({ ptRoutineInWorkout: true })

    usePtRoutineSetting()

    expect(mockUseFetch).toHaveBeenCalledWith('/api/auth/me')
  })

  test('enabled reflects the ptRoutineInWorkout flag', () => {
    stubMe({ ptRoutineInWorkout: true })
    expect(usePtRoutineSetting().enabled.value).toBe(true)

    stubMe({ ptRoutineInWorkout: false })
    expect(usePtRoutineSetting().enabled.value).toBe(false)
  })

  test('enabled is false while the profile has not loaded', () => {
    stubMe(null)
    expect(usePtRoutineSetting().enabled.value).toBe(false)
  })

  test('setEnabled patches the setting and refreshes the profile', async () => {
    const refresh = stubMe({ ptRoutineInWorkout: false })
    mockFetch.mockResolvedValueOnce({ ptRoutineInWorkout: true })

    const { setEnabled } = usePtRoutineSetting()
    await setEnabled(true)

    expect(mockFetch).toHaveBeenCalledWith('/api/auth/me', {
      method: 'PATCH',
      body: { ptRoutineInWorkout: true },
    })
    expect(refresh).toHaveBeenCalled()
  })

  test('setEnabled clears saving even when the request fails', async () => {
    stubMe({ ptRoutineInWorkout: false })
    mockFetch.mockRejectedValueOnce(new Error('network error'))

    const { setEnabled, saving } = usePtRoutineSetting()
    await expect(setEnabled(true)).rejects.toThrow('network error')

    expect(saving.value).toBe(false)
  })
})
