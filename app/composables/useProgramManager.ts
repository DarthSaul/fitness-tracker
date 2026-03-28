import type { ProgramSessionSummary, StartWorkoutResponse } from '~/types/workout'

interface ActiveProgramData {
  id: string
  programId: string
  currentWeek: number
  currentDay: number
  program: {
    id: string
    name: string
    description: string | null
    weeks: Array<{
      id: string
      weekNumber: number
      days: Array<{
        id: string
        dayNumber: number
        name: string | null
        exerciseGroups: Array<{
          exercises: Array<{
            sets: Array<{ id: string }>
          }>
        }>
      }>
    }>
  }
}

/** Composable for the program management view — shows all weeks/days with completion status. */
export function useProgramManager() {
  const { data: activeProgram, status: programStatus } = useFetch<ActiveProgramData>('/api/user-programs/active')
  const { data: sessionsData, status: sessionsStatus, refresh: refreshSessions } = useFetch<{ sessions: ProgramSessionSummary[] }>('/api/user-programs/active/sessions')

  const sessions = computed(() => sessionsData.value?.sessions ?? [])

  const isLoading = computed(() => programStatus.value === 'pending' || sessionsStatus.value === 'pending')

  /** Build a lookup key for week/day → session */
  function sessionKey(week: number, day: number): string {
    return `${week}-${day}`
  }

  /** Map from "week-day" → session for O(1) lookup. */
  const sessionMap = computed(() => {
    const map = new Map<string, ProgramSessionSummary>()
    for (const s of sessions.value) {
      map.set(sessionKey(s.weekNumber, s.dayNumber), s)
    }
    return map
  })

  function getSessionForDay(week: number, day: number): ProgramSessionSummary | undefined {
    return sessionMap.value.get(sessionKey(week, day))
  }

  function isDayCompleted(week: number, day: number): boolean {
    return getSessionForDay(week, day)?.status === 'COMPLETED'
  }

  function isDayInProgress(week: number, day: number): boolean {
    return getSessionForDay(week, day)?.status === 'IN_PROGRESS'
  }

  function isDayBeingEdited(weekNumber: number, dayNumber: number): boolean {
    const session = getSessionForDay(weekNumber, dayNumber)
    return session?.status === 'EDITING'
  }

  /** Count total sets in a day from the program structure. */
  function getTotalSetsForDay(weekNumber: number, dayNumber: number): number {
    if (!activeProgram.value) return 0
    const week = activeProgram.value.program.weeks.find(w => w.weekNumber === weekNumber)
    const day = week?.days.find(d => d.dayNumber === dayNumber)
    if (!day) return 0
    let count = 0
    for (const group of day.exerciseGroups) {
      for (const ex of group.exercises) {
        count += ex.sets.length
      }
    }
    return count
  }

  async function startRetroactiveSession(weekNumber: number, dayNumber: number): Promise<string> {
    const data = await $fetch<StartWorkoutResponse>('/api/workouts', {
      method: 'POST',
      body: { weekNumber, dayNumber },
    })
    clearNuxtData(CACHE_KEYS.ACTIVE_WORKOUT)
    clearNuxtData(CACHE_KEYS.ACTIVE_PROGRAM)
    clearNuxtData(CACHE_KEYS.ACTIVE_SESSIONS)
    await refreshSessions()
    return data.session.id
  }

  return {
    activeProgram,
    sessions,
    isLoading,
    programStatus,
    sessionsStatus,
    getSessionForDay,
    isDayCompleted,
    isDayInProgress,
    isDayBeingEdited,
    getTotalSetsForDay,
    startRetroactiveSession,
    refreshSessions,
  }
}
