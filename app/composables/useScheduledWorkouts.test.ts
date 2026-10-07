import { describe, test, expect, vi, beforeEach } from 'vitest'
import { ref, computed, watch, nextTick } from 'vue'
import { useScheduledWorkouts } from './useScheduledWorkouts'

const mockFetch = $fetch as unknown as ReturnType<typeof vi.fn>

function sw(id: string, week: number, day: number, date: string) {
  return { id, userProgramId: 'up1', weekNumber: week, dayNumber: day, scheduledDate: date }
}

/** Creates the composable for 'up1' and waits for its initial load to finish. */
async function loaded(initial: ReturnType<typeof sw>[] = []) {
  mockFetch.mockResolvedValueOnce({ scheduledWorkouts: initial })
  const api = useScheduledWorkouts(ref<string | undefined>('up1'))
  await vi.waitFor(() => expect(api.loading.value).toBe(false))
  return api
}

describe('useScheduledWorkouts', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // The global stubs for ref/computed are non-reactive; these tests need real reactivity.
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('computed', computed)
    vi.stubGlobal('watch', watch)
  })

  test('loads scheduled workouts for the program on creation', async () => {
    const monday = sw('s1', 1, 1, '2026-10-05T00:00:00.000Z')

    const { scheduledWorkouts } = await loaded([monday])

    expect(mockFetch).toHaveBeenCalledWith('/api/scheduled-workouts', { query: { userProgramId: 'up1' } })
    expect(scheduledWorkouts.value).toEqual([monday])
  })

  test('does not fetch while there is no program id', () => {
    const { scheduledWorkouts, loading } = useScheduledWorkouts(ref<string | undefined>(undefined))

    expect(mockFetch).not.toHaveBeenCalled()
    expect(scheduledWorkouts.value).toEqual([])
    expect(loading.value).toBe(false)
  })

  test('fetchScheduledWorkouts is a no-op without a program id', async () => {
    const { fetchScheduledWorkouts } = useScheduledWorkouts(ref<string | undefined>(undefined))

    await fetchScheduledWorkouts()

    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('shows loading while fetching and clears it afterwards', async () => {
    let resolve!: (v: unknown) => void
    mockFetch.mockReturnValue(new Promise((r) => { resolve = r }))
    const { loading } = useScheduledWorkouts(ref<string | undefined>('up1'))

    expect(loading.value).toBe(true)
    resolve({ scheduledWorkouts: [] })
    await vi.waitFor(() => expect(loading.value).toBe(false))
  })

  test('clears loading and rethrows when a fetch fails', async () => {
    const { fetchScheduledWorkouts, loading } = await loaded()
    mockFetch.mockRejectedValueOnce(new Error('boom'))

    await expect(fetchScheduledWorkouts()).rejects.toThrow('boom')
    expect(loading.value).toBe(false)
  })

  test('refetches when the program id appears and clears the list when it goes away', async () => {
    const monday = sw('s1', 1, 1, '2026-10-05T00:00:00.000Z')
    mockFetch.mockResolvedValue({ scheduledWorkouts: [monday] })
    const id = ref<string | undefined>(undefined)
    const { scheduledWorkouts } = useScheduledWorkouts(id)

    id.value = 'up1'
    await vi.waitFor(() => expect(scheduledWorkouts.value).toEqual([monday]))

    id.value = undefined
    await nextTick()
    expect(scheduledWorkouts.value).toEqual([])
  })

  test('schedules a workout and adds it to the list', async () => {
    const { scheduleWorkout, scheduledWorkouts } = await loaded()
    const created = sw('s2', 1, 2, '2026-10-06T00:00:00.000Z')
    mockFetch.mockResolvedValueOnce({ scheduledWorkout: created })

    const result = await scheduleWorkout(1, 2, '2026-10-06')

    expect(mockFetch).toHaveBeenLastCalledWith('/api/scheduled-workouts', {
      method: 'POST',
      body: { userProgramId: 'up1', weekNumber: 1, dayNumber: 2, scheduledDate: '2026-10-06' },
    })
    expect(result).toEqual(created)
    expect(scheduledWorkouts.value).toEqual([created])
  })

  test('refuses to schedule without a program id', async () => {
    const { scheduleWorkout } = useScheduledWorkouts(ref<string | undefined>(undefined))

    await expect(scheduleWorkout(1, 1, '2026-10-05')).rejects.toThrow('userProgramId is required')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('does not add anything to the list when scheduling fails', async () => {
    const { scheduleWorkout, scheduledWorkouts } = await loaded()
    mockFetch.mockRejectedValueOnce(new Error('409'))

    await expect(scheduleWorkout(1, 1, '2026-10-05')).rejects.toThrow('409')
    expect(scheduledWorkouts.value).toEqual([])
  })

  test('unschedules a workout and removes only that entry', async () => {
    const a = sw('a', 1, 1, '2026-10-05T00:00:00.000Z')
    const b = sw('b', 1, 2, '2026-10-06T00:00:00.000Z')
    const { unscheduleWorkout, scheduledWorkouts } = await loaded([a, b])
    mockFetch.mockResolvedValueOnce(undefined)

    await unscheduleWorkout('a')

    expect(mockFetch).toHaveBeenLastCalledWith('/api/scheduled-workouts/a', { method: 'DELETE' })
    expect(scheduledWorkouts.value).toEqual([b])
  })

  test('keeps the entry when unscheduling fails', async () => {
    const a = sw('a', 1, 1, '2026-10-05T00:00:00.000Z')
    const { unscheduleWorkout, scheduledWorkouts } = await loaded([a])
    mockFetch.mockRejectedValueOnce(new Error('500'))

    await expect(unscheduleWorkout('a')).rejects.toThrow('500')
    expect(scheduledWorkouts.value).toEqual([a])
  })

  test('finds schedules by date and by program day, and lists dates for calendar dots', async () => {
    const a = sw('a', 1, 1, '2026-10-05T00:00:00.000Z')
    const b = sw('b', 2, 3, '2026-10-12T00:00:00.000Z')
    const { getScheduleForDate, getScheduleForDay, scheduledDateStrings } = await loaded([a, b])

    expect(getScheduleForDate('2026-10-12')).toEqual(b)
    expect(getScheduleForDate('2026-11-01')).toBeUndefined()
    expect(getScheduleForDay(1, 1)).toEqual(a)
    expect(getScheduleForDay(9, 9)).toBeUndefined()
    expect(scheduledDateStrings.value).toEqual(['2026-10-05', '2026-10-12'])
  })
})
