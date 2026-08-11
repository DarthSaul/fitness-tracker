/**
 * Standalone workout detail — the full plan plus the start/resume CTA.
 * Mirrors `StandaloneWorkoutDetailView.swift`.
 */
<script setup lang="ts">
import type { StandaloneWorkoutDetail, ActiveStandaloneSession } from '~/types/standalone'

definePageMeta({
  layout: 'app',
  header: { title: 'Workout', style: 'inline' },
})

const route = useRoute()
const router = useRouter()
const workoutId = computed(() => String(route.params.id))

const { data: workout, status } = await useFetch<StandaloneWorkoutDetail>(
  () => `/api/standalone-workouts/${workoutId.value}`,
  { server: false },
)

const { data: active, refresh: refreshActive } = await useFetch<{ sessions: ActiveStandaloneSession[] }>(
  '/api/standalone-workout-sessions/active',
  { server: false },
)

usePageHeader(() => (workout.value ? { title: workout.value.name, style: 'inline' } : null))

const { startSession } = useStandaloneSession()

/** An in-progress session for *this* workout — resume rather than start. */
const resumable = computed(() =>
  active.value?.sessions.find(s => s.standaloneWorkoutId === workoutId.value) ?? null,
)

/** A session for some *other* workout blocks starting a new one. */
const conflicting = computed(() =>
  active.value?.sessions.find(s => s.standaloneWorkoutId !== workoutId.value) ?? null,
)

const starting = ref(false)
const conflictOpen = ref(false)
const error = ref<string | null>(null)

async function begin(): Promise<void> {
  if (resumable.value) {
    await router.push(`/standalone-workouts/session/${resumable.value.id}`)
    return
  }
  if (conflicting.value) {
    conflictOpen.value = true
    return
  }

  starting.value = true
  error.value = null
  try {
    const sessionId = await startSession(workoutId.value)
    await router.push(`/standalone-workouts/session/${sessionId}`)
  } catch {
    error.value = 'Could not start this workout. Please try again.'
  } finally {
    starting.value = false
  }
}

async function discardConflicting(): Promise<void> {
  if (!conflicting.value) return
  try {
    await $fetch<{ deleted: boolean }>(
      `/api/standalone-workout-sessions/${conflicting.value.id}`,
      { method: 'DELETE' as const },
    )
    conflictOpen.value = false
    await refreshActive()
    await begin()
  } catch {
    error.value = 'Could not discard the other workout.'
  }
}

function formatSet(set: { reps: number | null, weight: number | null, effortTarget: string | null }): string {
  const parts: string[] = []
  if (set.reps != null) parts.push(`${set.reps} reps`)
  if (set.weight != null) parts.push(`${set.weight} lb`)
  if (set.effortTarget) parts.push(set.effortTarget)
  return parts.join(' · ') || '—'
}
</script>

<template>
  <!-- pb-24 clears the fixed CTA; unneeded once it rejoins the flow at lg -->
  <div class="space-y-4 pb-24 lg:pb-0">
    <AppSkeleton v-if="status === 'pending'" :height="120" :count="3" />

    <div v-else-if="!workout" class="flex flex-col items-center gap-3 py-16 text-center">
      <UIcon name="i-lucide-triangle-alert" class="size-8 text-label-tertiary" />
      <p class="text-headline">Couldn't load this workout</p>
      <UButton variant="soft" label="Back" to="/standalone-workouts" class="mt-1" />
    </div>

    <template v-else>
      <p v-if="workout.description" class="text-subheadline text-label-secondary">
        {{ workout.description }}
      </p>

      <UAlert v-if="error" color="error" variant="subtle" :title="error" icon="i-lucide-alert-circle" />

      <section v-for="group in workout.groups" :key="group.id" class="space-y-2">
        <div class="flex items-center justify-between px-1">
          <span class="text-caption font-semibold uppercase text-label-secondary">
            {{ group.label || (group.type === 'SUPERSET' ? 'Superset' : 'Standard') }}
          </span>
          <span v-if="group.restSeconds" class="text-caption text-label-tertiary">
            Rest {{ group.restSeconds }}s
          </span>
        </div>

        <div class="space-y-3 rounded-card bg-surface p-4">
          <div v-for="exercise in group.exercises" :key="exercise.id">
            <p class="text-headline">{{ exercise.exercise.name }}</p>
            <div
              v-for="set in exercise.sets"
              :key="set.id"
              class="flex items-baseline justify-between gap-3 py-0.5"
            >
              <span class="text-subheadline text-label-secondary">Set {{ set.setNumber }}</span>
              <span class="text-subheadline tnum text-label">{{ formatSet(set) }}</span>
            </div>
          </div>
        </div>
      </section>
    </template>

    <!--
      Bottom CTA, over a gradient bleed into the safe area as on iOS. It goes
      back in flow on desktop: docking it to the window would span the whole
      frame and slide under the side rail.
    -->
    <div
      v-if="workout"
      class="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-canvas via-canvas/95 to-transparent px-4 pt-6 lg:static lg:mt-8 lg:bg-none lg:px-0 lg:pt-0"
      style="padding-bottom: calc(env(safe-area-inset-bottom) + 1rem)"
    >
      <div class="mx-auto max-w-lg lg:max-w-none">
        <UButton
          block
          size="xl"
          :color="resumable ? 'success' : 'primary'"
          :loading="starting"
          :icon="resumable ? 'i-lucide-arrow-right-circle' : 'i-lucide-play-circle'"
          :label="resumable ? 'Resume workout' : 'Start workout'"
          @click="begin"
        />
      </div>
    </div>

    <UModal v-model:open="conflictOpen" title="Workout in progress">
      <template #body>
        <p class="text-subheadline text-label-secondary">
          You already have "{{ conflicting?.standaloneWorkout.name }}" in progress. Finish it first,
          or discard it to start this one.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full gap-2">
          <UButton
            class="flex-1"
            variant="soft"
            label="Go to it"
            :to="conflicting ? `/standalone-workouts/session/${conflicting.id}` : undefined"
          />
          <UButton class="flex-1" color="error" variant="soft" label="Discard it" @click="discardConflicting" />
        </div>
      </template>
    </UModal>
  </div>
</template>
