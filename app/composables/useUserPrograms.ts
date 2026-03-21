import type { UserProgramSummary } from '~/types/user-program'

/**
 * Composable for managing the authenticated user's saved programs.
 * Provides save/unsave actions, activate/deactivate, and O(1) lookup of saved state by program ID.
 */
export function useUserPrograms() {
  const { data: userPrograms, refresh, status } = useFetch<UserProgramSummary[]>('/api/user-programs')
  const toast = useToast()

  const savingPrograms = ref<Set<string>>(new Set())
  const activatingPrograms = ref<Set<string>>(new Set())

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

  /** True if any saved program is currently active. */
  const hasActiveProgram = computed(() => {
    if (!userPrograms.value) return false
    return userPrograms.value.some(up => up.isActive)
  })

  /** Returns true if the program is in the user's saved list. */
  function isSaved(programId: string): boolean {
    return savedMap.value.has(programId)
  }

  /** Returns true if a save/unsave request is in-flight for the given program. */
  function isSaving(programId: string): boolean {
    return savingPrograms.value.has(programId)
  }

  /** Returns true if the given program is the currently active one. */
  function isActive(programId: string): boolean {
    const up = savedMap.value.get(programId)
    return up?.isActive ?? false
  }

  /** Returns true if an activate/deactivate request is in-flight for the given program. */
  function isActivating(programId: string): boolean {
    return activatingPrograms.value.has(programId)
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

  /** Activates or deactivates a program. Shows a toast if another program is already active. */
  async function toggleActive(programId: string): Promise<void> {
    if (isActivating(programId)) return

    const existing = savedMap.value.get(programId)
    if (!existing) return

    if (existing.isActive) {
      activatingPrograms.value.add(programId)
      try {
        await $fetch(`/api/user-programs/${existing.id}/deactivate`, { method: 'PATCH' })
        await refresh()
      } finally {
        activatingPrograms.value.delete(programId)
      }
      return
    }

    if (hasActiveProgram.value) {
      toast.add({
        title: 'You have an active program. You must deactivate it to start a new program.',
        color: 'error',
        icon: 'i-lucide-circle-alert',
      })
      return
    }

    activatingPrograms.value.add(programId)
    try {
      await $fetch(`/api/user-programs/${existing.id}/activate`, { method: 'PATCH' })
      await refresh()
    } finally {
      activatingPrograms.value.delete(programId)
    }
  }

  return {
    userPrograms,
    status,
    hasActiveProgram,
    isSaved,
    isSaving,
    isActive,
    isActivating,
    toggleSave,
    toggleActive,
    refresh,
  }
}
