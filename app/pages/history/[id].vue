/**
 * Read-only detail for a completed program workout.
 */
<script setup lang="ts">
import type { CompletedSetRecord, WorkoutSession } from '~/types/workout'
import type { ProgramDayDetail } from '~/types/program'
import type { DetailGroup, DetailLoggedSet } from '~/components/history/SessionDetail.vue'

definePageMeta({
  layout: 'app',
  header: { title: 'Workout', style: 'inline' },
})

const route = useRoute()
const sessionId = computed(() => String(route.params.id))

interface WorkoutDetailResponse {
  session: WorkoutSession & { completedSets: CompletedSetRecord[] }
  day: ProgramDayDetail
}

const { data, status } = await useFetch<WorkoutDetailResponse>(
  () => `/api/workouts/${sessionId.value}`,
  { server: false },
)

usePageHeader(() => {
  const session = data.value?.session
  if (!session) return null
  return { title: `Week ${session.weekNumber} · Day ${session.dayNumber}`, style: 'inline' }
})

const groups = computed<DetailGroup[]>(() =>
  (data.value?.day.exerciseGroups ?? []).map(group => ({
    id: group.id,
    type: group.type,
    restSeconds: group.restSeconds,
    exercises: group.exercises.map(exercise => ({
      id: exercise.id,
      name: exercise.exercise.name,
      sets: exercise.sets.map(set => ({
        id: set.id,
        setNumber: set.setNumber,
        reps: set.reps,
        weight: set.weight,
      })),
    })),
  })),
)

const logged = computed<DetailLoggedSet[]>(() =>
  (data.value?.session.completedSets ?? []).map(set => ({
    setId: set.exerciseSetId,
    exerciseId: set.programExerciseId,
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
      :warm-up="data.day.warmUp"
      :notes="data.session.notes"
    />
  </div>
</template>
