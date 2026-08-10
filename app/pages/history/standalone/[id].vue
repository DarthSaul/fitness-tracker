/**
 * Read-only detail for a completed "Strength on the Go" session.
 */
<script setup lang="ts">
import type { DetailGroup, DetailLoggedSet } from '~/components/history/SessionDetail.vue'

definePageMeta({
  layout: 'app',
  header: { title: 'Workout', style: 'inline' },
})

const route = useRoute()
const sessionId = computed(() => String(route.params.id))

interface StandaloneCompletedSet {
  id: string
  standaloneWorkoutSetId: string | null
  adhocExerciseName: string | null
  reps: number | null
  weight: number | null
}

interface StandaloneSessionResponse {
  session: {
    id: string
    startedAt: string
    completedAt: string | null
    notes: string | null
    completedSets: StandaloneCompletedSet[]
  }
  workout: {
    id: string
    name: string
    groups: {
      id: string
      type: 'STANDARD' | 'SUPERSET'
      label: string | null
      restSeconds: number | null
      exercises: {
        id: string
        exercise: { id: string, name: string }
        sets: { id: string, setNumber: number, reps: number | null, weight: number | null }[]
      }[]
    }[]
  }
}

const { data, status } = await useFetch<StandaloneSessionResponse>(
  () => `/api/standalone-workout-sessions/${sessionId.value}`,
  { server: false },
)

usePageHeader(() => {
  const workout = data.value?.workout
  return workout ? { title: workout.name, style: 'inline' } : null
})

const groups = computed<DetailGroup[]>(() =>
  (data.value?.workout.groups ?? []).map(group => ({
    id: group.id,
    type: group.type,
    label: group.label,
    restSeconds: group.restSeconds,
    exercises: group.exercises.map(exercise => ({
      id: exercise.id,
      name: exercise.exercise.name,
      sets: exercise.sets,
    })),
  })),
)

const logged = computed<DetailLoggedSet[]>(() =>
  (data.value?.session.completedSets ?? []).map(set => ({
    setId: set.standaloneWorkoutSetId,
    // Standalone sessions have no per-exercise extra sets, so an unmatched set
    // is always ad-hoc.
    exerciseId: null,
    exerciseName: set.adhocExerciseName,
    reps: set.reps,
    weight: set.weight,
  })),
)
</script>

<template>
  <div>
    <AppSkeleton v-if="status === 'pending'" :height="120" :count="3" />

    <div v-else-if="!data" class="flex flex-col items-center gap-3 py-16 text-center">
      <UIcon name="i-lucide-triangle-alert" class="size-8 text-label-tertiary" />
      <p class="text-headline">Couldn't load this workout</p>
      <UButton variant="soft" label="Back to history" to="/history" class="mt-1" />
    </div>

    <HistorySessionDetail
      v-else
      :completed-at="data.session.completedAt ?? data.session.startedAt"
      :groups="groups"
      :logged="logged"
      :notes="data.session.notes"
    />
  </div>
</template>
