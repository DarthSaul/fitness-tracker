import type { PtRoutine, PtRoutineExerciseInput } from '~/types/pt-routine'

/**
 * Composable for managing the authenticated user's PT routines.
 * Provides the routine list plus create/update/delete actions that refresh it.
 */
export function usePtRoutines() {
  const { data: routines, refresh, status } = useFetch<PtRoutine[]>('/api/pt-routines')

  const saving = ref(false)
  const deletingIds = ref<Set<string>>(new Set())

  /** True once the user has at least one routine. */
  const hasRoutines = computed(() => (routines.value?.length ?? 0) > 0)

  /** Creates a routine with its full ordered exercise list. */
  async function createRoutine(name: string, exercises: PtRoutineExerciseInput[]): Promise<void> {
    saving.value = true
    try {
      await $fetch('/api/pt-routines', { method: 'POST', body: { name, exercises } })
      await refresh()
    } finally {
      saving.value = false
    }
  }

  /** Renames a routine and/or atomically replaces its full exercise list. */
  async function updateRoutine(id: string, payload: { name?: string; exercises?: PtRoutineExerciseInput[] }): Promise<void> {
    saving.value = true
    try {
      await $fetch(`/api/pt-routines/${id}`, { method: 'PATCH', body: payload })
      await refresh()
    } finally {
      saving.value = false
    }
  }

  /** Deletes a routine and its exercises. */
  async function deleteRoutine(id: string): Promise<void> {
    if (deletingIds.value.has(id)) return

    deletingIds.value.add(id)
    try {
      await $fetch(`/api/pt-routines/${id}`, { method: 'DELETE' })
      await refresh()
    } finally {
      deletingIds.value.delete(id)
    }
  }

  /** Returns true if a delete request is in-flight for the given routine. */
  function isDeleting(id: string): boolean {
    return deletingIds.value.has(id)
  }

  return {
    routines,
    status,
    hasRoutines,
    saving,
    createRoutine,
    updateRoutine,
    deleteRoutine,
    isDeleting,
    refresh,
  }
}
