export interface AnalyticsDashboard {
  totalSessions: number
  totalVolumeLbs: number
  currentStreakDays: number
  longestStreakDays: number
  lastWorkoutAt: string | null
  totalExercises: number
}

export interface AnalyticsExerciseListItem {
  id: string
  name: string
  sessionCount: number
  lastCompletedAt: string
}

export interface AnalyticsSessionSet {
  reps: number | null
  weight: number | null
  e1rm: number | null
}

export interface AnalyticsSessionEntry {
  sessionId: string
  completedAt: string
  weekNumber: number
  dayNumber: number
  sets: AnalyticsSessionSet[]
  bestE1rm: number | null
  totalVolume: number | null
}

export interface AnalyticsExerciseHistory {
  exercise: { id: string; name: string }
  history: AnalyticsSessionEntry[]
}

export function useAnalytics() {
  // Dashboard stats
  const { data: dashboard, status: dashboardStatus } =
    useFetch<AnalyticsDashboard>('/api/analytics/dashboard')

  // Exercise list
  const { data: exercises, status: exercisesStatus } =
    useFetch<AnalyticsExerciseListItem[]>('/api/analytics/exercises')

  // Per-exercise history — loaded imperatively on selection
  const selectedExerciseId = ref<string | null>(null)
  const exerciseHistory = ref<AnalyticsExerciseHistory | null>(null)
  const historyStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

  async function selectExercise(id: string) {
    if (selectedExerciseId.value === id) {
      selectedExerciseId.value = null
      exerciseHistory.value = null
      historyStatus.value = 'idle'
      return
    }
    selectedExerciseId.value = id
    exerciseHistory.value = null
    historyStatus.value = 'pending'
    try {
      exerciseHistory.value = await $fetch<AnalyticsExerciseHistory>(
        `/api/analytics/exercises/${id}`
      )
      historyStatus.value = 'success'
    } catch {
      historyStatus.value = 'error'
    }
  }

  return {
    dashboard,
    dashboardStatus,
    exercises,
    exercisesStatus,
    exerciseHistory,
    historyStatus,
    selectedExerciseId,
    selectExercise,
  }
}
