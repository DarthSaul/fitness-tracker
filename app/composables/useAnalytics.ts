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

  // Tracks the AbortController for the in-flight request. When a new exercise
  // is selected before the previous fetch completes, the old controller is
  // aborted and its result is ignored even if the response still arrives.
  let currentController: AbortController | null = null

  async function selectExercise(id: string) {
    // Toggle off when the same exercise is tapped again
    if (selectedExerciseId.value === id) {
      currentController?.abort()
      currentController = null
      selectedExerciseId.value = null
      exerciseHistory.value = null
      historyStatus.value = 'idle'
      return
    }

    // Cancel any in-flight request for a previous selection
    currentController?.abort()
    const controller = new AbortController()
    currentController = controller

    selectedExerciseId.value = id
    exerciseHistory.value = null
    historyStatus.value = 'pending'

    try {
      const result = await $fetch<AnalyticsExerciseHistory>(
        `/api/analytics/exercises/${encodeURIComponent(id)}`,
        { signal: controller.signal },
      )

      // Ignore stale responses if a newer request has already started
      if (currentController === controller) {
        exerciseHistory.value = result
        historyStatus.value = 'success'
        currentController = null
      }
    } catch {
      if (currentController === controller) {
        historyStatus.value = 'error'
        currentController = null
      }
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
