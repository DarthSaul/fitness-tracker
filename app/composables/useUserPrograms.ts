import type { UserProgramSummary } from '~/types/user-program'

/**
 * Composable for managing the authenticated user's saved programs.
 * Provides save/unsave actions and O(1) lookup of saved state by program ID.
 */
export function useUserPrograms() {
  const { data: userPrograms, refresh, status } = useFetch<UserProgramSummary[]>('/api/user-programs')

  const savingPrograms = ref<Set<string>>(new Set())

  /** Map from programId → UserProgramSummary for O(1) lookup. */
  const savedMap = computed(() => {
    const map = new Map<string, UserProgramSummary>()
    if (userPrograms.value) {
      for (const up of userPrograms.value) {
        map.set(up.programId, up)
      }
    }
    return map
  })

  /** Returns true if the program is in the user's saved list. */
  function isSaved(programId: string): boolean {
    return savedMap.value.has(programId)
  }

  /** Returns true if a save/unsave request is in-flight for the given program. */
  function isSaving(programId: string): boolean {
    return savingPrograms.value.has(programId)
  }

  /** Saves or unsaves a program depending on its current state. */
  async function toggleSave(programId: string): Promise<void> {
    if (isSaving(programId)) return

    savingPrograms.value.add(programId)
    try {
      const existing = savedMap.value.get(programId)
      if (existing) {
        await $fetch(`/api/user-programs/${existing.id}`, { method: 'DELETE' })
      } else {
        await $fetch('/api/user-programs', { method: 'POST', body: { programId } })
      }
      await refresh()
    } finally {
      savingPrograms.value.delete(programId)
    }
  }

  return {
    userPrograms,
    status,
    isSaved,
    isSaving,
    toggleSave,
    refresh,
  }
}
