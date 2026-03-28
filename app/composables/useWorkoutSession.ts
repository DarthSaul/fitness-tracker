import type {
  WorkoutSession,
  CompletedSetRecord,
  StartWorkoutResponse,
  ActiveWorkoutResponse,
  CompleteWorkoutResponse,
} from '~/types/workout'
import type { ProgramDayDetail } from '~/types/program'

/** Composable for managing an active workout session: start, record sets, complete. */
export function useWorkoutSession() {
  const session = ref<WorkoutSession | null>(null)
  const day = ref<ProgramDayDetail | null>(null)
  const completedSets = ref(new Map<string, CompletedSetRecord>())
  const loading = ref(false)
  const completing = ref(false)
  const abandoning = ref(false)
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
      clearNuxtData(CACHE_KEYS.ACTIVE_WORKOUT)
      clearNuxtData(CACHE_KEYS.ACTIVE_PROGRAM)
      clearNuxtData(CACHE_KEYS.ACTIVE_SESSIONS)
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

  async function completeWorkout(completedAt?: string | null): Promise<CompleteWorkoutResponse> {
    if (!session.value) throw new Error('No active session')
    completing.value = true
    try {
      const result = await $fetch<CompleteWorkoutResponse>(
        `/api/workouts/${session.value.id}/complete`,
        { method: 'PATCH', body: completedAt === undefined ? undefined : { completedAt } },
      )
      session.value = result.session
      clearNuxtData(CACHE_KEYS.ACTIVE_WORKOUT)
      clearNuxtData(CACHE_KEYS.ACTIVE_PROGRAM)
      clearNuxtData(CACHE_KEYS.ACTIVE_SESSIONS)
      return result
    } finally {
      completing.value = false
    }
  }

  async function abandonWorkout(): Promise<void> {
    if (!session.value) throw new Error('No active session')
    abandoning.value = true
    try {
      await $fetch<{ deleted: boolean }>(`/api/workouts/${session.value.id}`, { method: 'DELETE' as const })
      session.value = null
      day.value = null
      completedSets.value = new Map()
      clearNuxtData(CACHE_KEYS.ACTIVE_WORKOUT)
      clearNuxtData(CACHE_KEYS.ACTIVE_PROGRAM)
      clearNuxtData(CACHE_KEYS.ACTIVE_SESSIONS)
    } finally {
      abandoning.value = false
    }
  }

  async function loadSession(sessionId: string): Promise<boolean> {
    try {
      const data = await $fetch<ActiveWorkoutResponse>(`/api/workouts/${sessionId}`)
      session.value = data.session
      day.value = data.day
      completedSets.value = new Map(
        data.session.completedSets.map((cs) => [cs.exerciseSetId, cs]),
      )
      return true
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode === 404) {
        session.value = null
        day.value = null
        completedSets.value = new Map()
        return false
      }
      throw e
    }
  }

  async function updateSet(
    exerciseSetId: string,
    data: { reps?: number | null; weight?: number | null; rpe?: number | null; notes?: string | null },
  ): Promise<void> {
    if (!session.value) return
    const existing = completedSets.value.get(exerciseSetId)
    if (!existing) return
    recordingSetId.value = exerciseSetId
    try {
      const result = await $fetch<CompletedSetRecord>(
        `/api/workouts/${session.value.id}/sets/${existing.id}`,
        { method: 'PATCH', body: data },
      )
      completedSets.value.set(exerciseSetId, result)
    } finally {
      recordingSetId.value = null
    }
  }

  async function deleteCompletedSet(exerciseSetId: string): Promise<void> {
    if (!session.value) return
    const existing = completedSets.value.get(exerciseSetId)
    if (!existing) return
    recordingSetId.value = exerciseSetId
    try {
      await $fetch(`/api/workouts/${session.value.id}/sets/${existing.id}`, { method: 'DELETE' })
      completedSets.value.delete(exerciseSetId)
    } finally {
      recordingSetId.value = null
    }
  }

  return {
    session,
    day,
    completedSets,
    loading,
    completing,
    abandoning,
    recordingSetId,
    error,
    totalSets,
    completedSetCount,
    progressPercent,
    isSetCompleted,
    getCompletedSet,
    loadActiveSession,
    loadSession,
    startWorkout,
    recordSet,
    updateSet,
    deleteCompletedSet,
    completeWorkout,
    abandonWorkout,
  }
}
