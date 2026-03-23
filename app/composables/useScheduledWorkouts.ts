interface ScheduledWorkout {
  id: string
  userProgramId: string
  weekNumber: number
  dayNumber: number
  scheduledDate: string
}

/** Composable for managing scheduled workouts — fetching, scheduling, and unscheduling. */
export function useScheduledWorkouts(userProgramId: Ref<string | undefined>) {
  const scheduledWorkouts = ref<ScheduledWorkout[]>([])
  const loading = ref(false)

  async function fetchScheduledWorkouts(): Promise<void> {
    if (!userProgramId.value) return
    loading.value = true
    try {
      const data = await $fetch<{ scheduledWorkouts: ScheduledWorkout[] }>('/api/scheduled-workouts', {
        query: { userProgramId: userProgramId.value },
      })
      scheduledWorkouts.value = data.scheduledWorkouts
    } finally {
      loading.value = false
    }
  }

  async function scheduleWorkout(weekNumber: number, dayNumber: number, scheduledDate: string): Promise<ScheduledWorkout> {
    if (!userProgramId.value) {
      throw new Error('userProgramId is required to schedule a workout')
    }
    const data = await $fetch<{ scheduledWorkout: ScheduledWorkout }>('/api/scheduled-workouts', {
      method: 'POST',
      body: { userProgramId: userProgramId.value, weekNumber, dayNumber, scheduledDate },
    })
    scheduledWorkouts.value.push(data.scheduledWorkout)
    return data.scheduledWorkout
  }

  async function unscheduleWorkout(id: string): Promise<void> {
    await $fetch(`/api/scheduled-workouts/${id}`, { method: 'DELETE' })
    scheduledWorkouts.value = scheduledWorkouts.value.filter(sw => sw.id !== id)
  }

  /** Get the scheduled workout for a specific date (YYYY-MM-DD string). */
  function getScheduleForDate(dateStr: string): ScheduledWorkout | undefined {
    return scheduledWorkouts.value.find(sw => sw.scheduledDate.startsWith(dateStr))
  }

  /** Get the scheduled workout for a specific program day. */
  function getScheduleForDay(weekNumber: number, dayNumber: number): ScheduledWorkout | undefined {
    return scheduledWorkouts.value.find(sw => sw.weekNumber === weekNumber && sw.dayNumber === dayNumber)
  }

  /** All scheduled dates as YYYY-MM-DD strings for calendar dot indicators. */
  const scheduledDateStrings = computed(() => {
    return scheduledWorkouts.value.map(sw => sw.scheduledDate.substring(0, 10))
  })

  // Fetch when userProgramId becomes available
  watch(userProgramId, (newId) => {
    if (newId) {
      fetchScheduledWorkouts()
    } else {
      scheduledWorkouts.value = []
    }
  }, { immediate: true })

  return {
    scheduledWorkouts,
    loading,
    fetchScheduledWorkouts,
    scheduleWorkout,
    unscheduleWorkout,
    getScheduleForDate,
    getScheduleForDay,
    scheduledDateStrings,
  }
}
