<script setup lang="ts">
definePageMeta({ layout: 'app', header: { title: 'Log Workout', style: 'inline' } })

const route = useRoute()
const router = useRouter()

const weekNumber = computed(() => Number(route.params.week))
const dayNumber = computed(() => Number(route.params.day))

const { startRetroactiveSession, getSessionForDay, refreshSessions } = useProgramManager()

// The editor loads the session itself; this page only resolves which one.
const sessionId = ref<string | null>(null)
const pageError = ref<string | null>(null)
const startingSession = ref(false)

onMounted(() => {
  sessionId.value = getSessionForDay(weekNumber.value, dayNumber.value)?.id ?? null
})

async function handleStartLogging(): Promise<void> {
  pageError.value = null
  startingSession.value = true
  try {
    sessionId.value = await startRetroactiveSession(weekNumber.value, dayNumber.value)
  } catch (e) {
    const err = e as { statusCode?: number; statusMessage?: string }
    if (err.statusCode === 409) {
      pageError.value = 'A session already exists for this day'
    } else if (err.statusCode === 400 && err.statusMessage) {
      pageError.value = err.statusMessage
    } else {
      pageError.value = 'Failed to create session'
    }
  } finally {
    startingSession.value = false
  }
}

async function onSaved(): Promise<void> {
  // Save succeeded — navigate away; don't let refresh failure block the user
  refreshSessions().catch(() => {})
  await router.push('/program')
}

async function onDiscarded(): Promise<void> {
  await refreshSessions().catch(() => {})
  await router.push('/program')
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <h2 class="text-title3 font-semibold">
      Week {{ weekNumber }}, Day {{ dayNumber }}
    </h2>

    <!-- Error -->
    <UAlert v-if="pageError" color="error" variant="subtle" :title="pageError" icon="i-lucide-alert-circle" />

    <!-- Session exists — show editor -->
    <WorkoutSessionEditor
      v-if="sessionId"
      :session-id="sessionId"
      @saved="onSaved"
      @discarded="onDiscarded"
    />

    <!-- No session yet — show start logging prompt -->
    <div v-else-if="!pageError" class="flex flex-col items-center gap-4 py-8 text-center">
      <UIcon name="i-lucide-clipboard-list" class="size-12 text-label-tertiary" />
      <p class="text-label-secondary">
        No workout logged for this day yet.
      </p>
      <UButton
        color="primary"
        size="lg"
        :loading="startingSession"
        @click="handleStartLogging"
      >
        Start Logging
      </UButton>
    </div>
  </div>
</template>
