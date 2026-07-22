/** Profile shape returned by GET /api/auth/me. */
interface MeResponse {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  ptRoutineInWorkout: boolean
}

/**
 * Composable for the user's "PT routine in workout" profile setting.
 * Reads the flag from /api/auth/me and persists changes via PATCH.
 */
export function usePtRoutineSetting() {
  const { data: me, refresh, status } = useFetch<MeResponse>('/api/auth/me')

  const saving = ref(false)

  /** True when the user wants PT routines shown in the active workout view. */
  const enabled = computed(() => me.value?.ptRoutineInWorkout ?? false)

  /** Persists the setting and refreshes the profile. */
  async function setEnabled(value: boolean): Promise<void> {
    if (saving.value) return

    saving.value = true
    try {
      await $fetch('/api/auth/me', { method: 'PATCH', body: { ptRoutineInWorkout: value } })
      await refresh()
    } finally {
      saving.value = false
    }
  }

  return {
    enabled,
    status,
    saving,
    setEnabled,
    refresh,
  }
}
