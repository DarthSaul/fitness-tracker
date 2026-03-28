export const CACHE_KEYS = {
  ACTIVE_PROGRAM: 'active-program',
  ACTIVE_SESSIONS: 'active-sessions',
  ACTIVE_WORKOUT: 'active-workout',
  PROGRAMS: 'programs',
} as const

export function getCached<T>(key: string): T | undefined {
  const nuxtApp = useNuxtApp()
  return (nuxtApp.payload.data[key] ?? nuxtApp.static.data[key]) as T | undefined
}
