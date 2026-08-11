import type {
  StandaloneCompletedSet,
  StandaloneSessionDetail,
  StandaloneWorkoutDetail,
  StandaloneSession,
} from '~/types/standalone'

/**
 * State machine for a live "Strength on the Go" session.
 *
 * Mirrors `useWorkoutSession` for program workouts, minus warm-ups, exercise
 * swaps and Core — none of which standalone workouts have.
 */
export function useStandaloneSession() {
  const session = ref<StandaloneSession | null>(null)
  const workout = ref<StandaloneWorkoutDetail | null>(null)
  /** Prescribed set id → the set logged against it. */
  const completedSets = ref<Map<string, StandaloneCompletedSet>>(new Map())
  const adHocSets = ref<StandaloneCompletedSet[]>([])

  const loading = ref(false)
  const completing = ref(false)
  const abandoning = ref(false)
  const recordingSetId = ref<string | null>(null)
  const error = ref<string | null>(null)

  const totalSets = computed(() => {
    if (!workout.value) return 0
    return workout.value.groups.reduce(
      (total, group) => total + group.exercises.reduce((n, ex) => n + ex.sets.length, 0),
      0,
    )
  })

  const completedSetCount = computed(() => completedSets.value.size)

  const progressPercent = computed(() => {
    if (totalSets.value === 0) return 0
    return Math.round((completedSetCount.value / totalSets.value) * 100)
  })

  function indexSets(sets: StandaloneCompletedSet[]): void {
    const byTemplateSet = new Map<string, StandaloneCompletedSet>()
    const adhoc: StandaloneCompletedSet[] = []
    for (const set of sets) {
      if (set.standaloneWorkoutSetId) byTemplateSet.set(set.standaloneWorkoutSetId, set)
      else adhoc.push(set)
    }
    completedSets.value = byTemplateSet
    adHocSets.value = adhoc
  }

  function isSetCompleted(setId: string): boolean {
    return completedSets.value.has(setId)
  }

  function getCompletedSet(setId: string): StandaloneCompletedSet | null {
    return completedSets.value.get(setId) ?? null
  }

  async function loadSession(sessionId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const result = await $fetch<StandaloneSessionDetail>(
        `/api/standalone-workout-sessions/${sessionId}`,
      )
      session.value = result.session
      workout.value = result.workout
      indexSets(result.session.completedSets)
    } catch {
      error.value = 'Failed to load workout'
    } finally {
      loading.value = false
    }
  }

  /** Starts a session and returns its id so the caller can navigate to it. */
  async function startSession(standaloneWorkoutId: string): Promise<string> {
    const result = await $fetch<{ session: StandaloneSession }>(
      '/api/standalone-workout-sessions',
      { method: 'POST', body: { standaloneWorkoutId } },
    )
    return result.session.id
  }

  async function recordSet(
    setId: string,
    values: { reps: number | null, weight: number | null },
  ): Promise<void> {
    if (!session.value) return
    recordingSetId.value = setId
    try {
      const existing = completedSets.value.get(setId)
      const saved = existing
        ? await $fetch<StandaloneCompletedSet>(
            `/api/standalone-workout-sessions/${session.value.id}/sets/${existing.id}`,
            { method: 'PATCH', body: values },
          )
        : await $fetch<StandaloneCompletedSet>(
            `/api/standalone-workout-sessions/${session.value.id}/sets`,
            { method: 'POST', body: { standaloneWorkoutSetId: setId, ...values } },
          )

      // Reassign rather than mutate — a Map mutation is not reactive.
      const next = new Map(completedSets.value)
      next.set(setId, saved)
      completedSets.value = next
    } finally {
      recordingSetId.value = null
    }
  }

  async function deleteSet(setId: string): Promise<void> {
    if (!session.value) return
    const existing = completedSets.value.get(setId)
    if (!existing) return

    await $fetch(`/api/standalone-workout-sessions/${session.value.id}/sets/${existing.id}`, {
      method: 'DELETE',
    })
    const next = new Map(completedSets.value)
    next.delete(setId)
    completedSets.value = next
  }

  async function completeSession(): Promise<void> {
    if (!session.value) return
    completing.value = true
    try {
      await $fetch(`/api/standalone-workout-sessions/${session.value.id}/complete`, {
        method: 'PATCH',
      })
    } finally {
      completing.value = false
    }
  }

  async function abandonSession(): Promise<void> {
    if (!session.value) return
    abandoning.value = true
    try {
      // Explicit generic: without it the typed-route overload narrows the
      // method union to GET for this path.
      await $fetch<{ deleted: boolean }>(
        `/api/standalone-workout-sessions/${session.value.id}`,
        { method: 'DELETE' as const },
      )
    } finally {
      abandoning.value = false
    }
  }

  return {
    session,
    workout,
    completedSets,
    adHocSets,
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
    loadSession,
    startSession,
    recordSet,
    deleteSet,
    completeSession,
    abandonSession,
  }
}
