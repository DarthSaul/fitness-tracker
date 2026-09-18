/**
 * Edits a completed program workout straight from History. The editor loads
 * the session by id alone, so this works with no active program — unlike the
 * program day page, which can only reach sessions of the active program.
 */
<script setup lang="ts">
import type { WorkoutSession } from '~/types/workout'

definePageMeta({
  layout: 'app',
  header: { title: 'Edit Workout', style: 'inline' },
})

const route = useRoute()
const router = useRouter()
const sessionId = computed(() => String(route.params.id))

const loadedSession = ref<WorkoutSession | null>(null)

usePageHeader(() => {
  const session = loadedSession.value
  if (!session) return null
  return { title: `Edit · Week ${session.weekNumber} · Day ${session.dayNumber}`, style: 'inline' }
})

/** Home and the program views cache session lists that an edit can change. */
function invalidateSessionCaches(): void {
  clearNuxtData(CACHE_KEYS.ACTIVE_WORKOUT)
  clearNuxtData(CACHE_KEYS.ACTIVE_PROGRAM)
  clearNuxtData(CACHE_KEYS.ACTIVE_SESSIONS)
}

// Edits to a completed session save as they are made, so "Done" needs this too
async function backToDetail(): Promise<void> {
  invalidateSessionCaches()
  await router.push(`/history/${sessionId.value}`)
}

// Only reachable for a session that was still EDITING; once discarded it is gone
async function onDiscarded(): Promise<void> {
  invalidateSessionCaches()
  await router.push('/history')
}

async function onSaved(): Promise<void> {
  await backToDetail()
}
</script>

<template>
  <div class="space-y-4">
    <WorkoutSessionEditor
      :session-id="sessionId"
      @loaded="(session) => { loadedSession = session }"
      @saved="onSaved"
      @discarded="onDiscarded"
    />
    <AppActionPill label="Done" icon="" tint="secondary" @click="backToDetail" />
  </div>
</template>
