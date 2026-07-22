<!--
  Bottom sheet drawer showing the user's PT routines during a workout.
  Presentational only — exercises are listed with their reps or duration,
  never tracked as part of the workout session.
-->
<script setup lang="ts">
import type { PtRoutine, PtRoutineExercise } from '~/types/pt-routine'

const props = defineProps<{
  open: boolean
  routines: PtRoutine[]
}>()

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const isOpen = computed({
  get: () => props.open,
  set: (v: boolean) => emit('update:open', v),
})

const selectedId = ref<string | null>(null)

const selectedRoutine = computed(() =>
  props.routines.find(routine => routine.id === selectedId.value) ?? props.routines[0] ?? null,
)

// Default the selection to the first routine whenever the drawer opens with a
// stale or missing selection (e.g. the previously viewed routine was deleted)
watch(() => props.open, (opened) => {
  if (opened && !props.routines.some(routine => routine.id === selectedId.value)) {
    selectedId.value = props.routines[0]?.id ?? null
  }
}, { immediate: true })

function formatMeasure(exercise: PtRoutineExercise): string {
  return exercise.reps !== null ? `${exercise.reps} reps` : `${exercise.durationSeconds}s`
}
</script>

<template>
  <UDrawer v-model:open="isOpen" direction="bottom" title="PT Routines" description="Your PT routines with each exercise's reps or duration">
    <template #content>
      <div class="mx-auto max-h-[75dvh] w-full max-w-lg overflow-y-auto px-5 pb-8 pt-4">
        <!-- Header -->
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-white">PT Routines</h3>
          <button
            class="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            aria-label="Close"
            @click="isOpen = false"
          >
            <UIcon name="i-lucide-x" class="size-5" />
          </button>
        </div>

        <!-- Routine switcher -->
        <div v-if="routines.length > 1" class="mb-4 flex gap-2 overflow-x-auto pb-1">
          <button
            v-for="routine in routines"
            :key="routine.id"
            type="button"
            data-testid="routine-pill"
            class="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
            :class="routine.id === selectedRoutine?.id ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'"
            @click="selectedId = routine.id"
          >
            {{ routine.name }}
          </button>
        </div>
        <p v-else-if="selectedRoutine" class="mb-4 text-sm font-medium text-slate-300">
          {{ selectedRoutine.name }}
        </p>

        <!-- Exercise list (read-only) -->
        <ol v-if="selectedRoutine" class="space-y-2">
          <li
            v-for="(exercise, index) in selectedRoutine.exercises"
            :key="exercise.id"
            class="flex items-baseline gap-2 rounded-lg bg-slate-800/60 px-3 py-2.5"
          >
            <span class="text-sm font-semibold text-violet-400">{{ index + 1 }}.</span>
            <span class="flex-1 text-sm text-white">{{ exercise.title }}</span>
            <span class="text-sm text-slate-400">{{ formatMeasure(exercise) }}</span>
          </li>
        </ol>
      </div>
    </template>
  </UDrawer>
</template>
