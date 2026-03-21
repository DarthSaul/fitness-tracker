import type {
  WorkoutSession,
  CompletedSetRecord,
  StartWorkoutResponse,
  ActiveWorkoutResponse,
  CompleteWorkoutResponse,
} from '~/types/workout'
import type { ProgramDayDetail, ExerciseSetDetail } from '~/types/program'

/** Composable for managing an active workout session: start, record sets, complete. */
export function useWorkoutSession() {
  const session = ref<WorkoutSession | null>(null)
  const day = ref<ProgramDayDetail | null>(null)
  const completedSets = ref(new Map<string, CompletedSetRecord>())
  const loading = ref(false)
  const completing = ref(false)
  const recordingSetId = ref<string | null>(null)
  const error = ref<string | null>(null)

  const totalSets = computed(() => {
    if (!day.value) return 0
    let count = 0
    for (const group of day.value.exerciseGroups) {
      for (const exercise of group.exercises) {
        count += exercise.sets.length
      }
    }
    return count
  })

  const completedSetCount = computed(() => completedSets.value.size)

  const progressPercent = computed(() => {
    if (totalSets.value === 0) return 0
    return Math.round((completedSetCount.value / totalSets.value) * 100)
  })

  function isSetCompleted(exerciseSetId: string): boolean {
    return completedSets.value.has(exerciseSetId)
  }

  function getCompletedSet(exerciseSetId: string): CompletedSetRecord | undefined {
    return completedSets.value.get(exerciseSetId)
  }

  async function loadActiveSession(): Promise<boolean> {
    try {
      const data = await $fetch<ActiveWorkoutResponse>('/api/workouts/active')
      session.value = data.session
      day.value = data.day
      completedSets.value = new Map(
        data.session.completedSets.map((cs) => [cs.exerciseSetId, cs]),
      )
      return true
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode === 404) {
        return false
      }
      throw e
    }
  }

  async function startWorkout(): Promise<string> {
    loading.value = true
    error.value = null
    try {
      const data = await $fetch<StartWorkoutResponse>('/api/workouts', { method: 'POST' })
      session.value = data.session
      day.value = data.day
      completedSets.value = new Map()
      return data.session.id
    } catch (e) {
      const statusCode = (e as { statusCode?: number }).statusCode
      if (statusCode === 409) {
        error.value = 'A workout session is already in progress'
      } else if (statusCode === 400) {
        error.value = 'No active program. Save and activate a program first.'
      } else {
        error.value = 'Failed to start workout'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function recordSet(
    exerciseSetId: string,
    data: { reps?: number | null; weight?: number | null; rpe?: number | null; notes?: string | null },
  ): Promise<void> {
    if (!session.value) return
    recordingSetId.value = exerciseSetId
    try {
      const result = await $fetch<CompletedSetRecord>(
        `/api/workouts/${session.value.id}/sets`,
        { method: 'POST', body: { exerciseSetId, ...data } },
      )
      completedSets.value.set(exerciseSetId, result)
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode === 409) {
        // Already recorded — mark as completed locally
        return
      }
      throw e
    } finally {
      recordingSetId.value = null
    }
  }

  async function completeWorkout(): Promise<CompleteWorkoutResponse> {
    if (!session.value) throw new Error('No active session')
    completing.value = true
    try {
      const result = await $fetch<CompleteWorkoutResponse>(
        `/api/workouts/${session.value.id}/complete`,
        { method: 'PATCH' },
      )
      session.value = result.session
      return result
    } finally {
      completing.value = false
    }
  }

  return {
    session,
    day,
    completedSets,
    loading,
    completing,
    recordingSetId,
    error,
    totalSets,
    completedSetCount,
    progressPercent,
    isSetCompleted,
    getCompletedSet,
    loadActiveSession,
    startWorkout,
    recordSet,
    completeWorkout,
  }
}
