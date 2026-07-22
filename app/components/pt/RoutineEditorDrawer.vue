<!--
  Bottom sheet drawer for creating or editing a PT routine: a name plus an
  ordered list of exercises, each with a title and either reps or a duration
  in seconds. Emits the full draft on save — the parent persists it atomically.
-->
<script setup lang="ts">
import type { PtRoutine, PtRoutineExerciseInput } from '~/types/pt-routine'

interface DraftExercise {
  title: string
  measure: 'reps' | 'duration'
  value: number | null
}

const props = defineProps<{
  open: boolean
  routine: PtRoutine | null
  saving: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [payload: { name: string; exercises: PtRoutineExerciseInput[] }]
}>()

const isOpen = computed({
  get: () => props.open,
  set: (v: boolean) => emit('update:open', v),
})

const name = ref('')
const drafts = ref<DraftExercise[]>([])

function blankDraft(): DraftExercise {
  return { title: '', measure: 'reps', value: null }
}

// Reset the draft from the routine prop each time the drawer opens
// (immediate: true handles the v-if mount-with-open=true case)
watch(() => props.open, (opened) => {
  if (!opened) return
  name.value = props.routine?.name ?? ''
  drafts.value = props.routine
    ? props.routine.exercises.map(exercise => ({
        title: exercise.title,
        measure: exercise.reps !== null ? 'reps' as const : 'duration' as const,
        value: exercise.reps !== null ? exercise.reps : exercise.durationSeconds,
      }))
    : [blankDraft()]
}, { immediate: true })

function addExercise(): void {
  if (drafts.value.length >= 50) return
  drafts.value.push(blankDraft())
}

function removeExercise(index: number): void {
  drafts.value.splice(index, 1)
}

function moveExercise(index: number, delta: -1 | 1): void {
  const target = index + delta
  if (target < 0 || target >= drafts.value.length) return
  const [row] = drafts.value.splice(index, 1)
  drafts.value.splice(target, 0, row!)
}

function setMeasure(draft: DraftExercise, measure: 'reps' | 'duration'): void {
  if (draft.measure === measure) return
  draft.measure = measure
  draft.value = null
}

function isDraftValid(draft: DraftExercise): boolean {
  const title = draft.title.trim()
  if (!title || title.length > 100) return false
  if (draft.value === null || !Number.isInteger(draft.value)) return false
  const max = draft.measure === 'reps' ? 1000 : 3600
  return draft.value >= 1 && draft.value <= max
}

const canSave = computed(() => {
  const trimmed = name.value.trim()
  if (!trimmed || trimmed.length > 100) return false
  if (drafts.value.length === 0 || drafts.value.length > 50) return false
  return drafts.value.every(isDraftValid)
})

function handleSave(): void {
  if (!canSave.value || props.saving) return
  emit('save', {
    name: name.value.trim(),
    exercises: drafts.value.map(draft => ({
      title: draft.title.trim(),
      durationSeconds: draft.measure === 'duration' ? draft.value : null,
      reps: draft.measure === 'reps' ? draft.value : null,
    })),
  })
}
</script>

<template>
  <UDrawer v-model:open="isOpen" direction="bottom" :title="routine ? 'Edit PT Routine' : 'New PT Routine'" description="Name the routine and list its exercises with reps or a duration in seconds">
    <template #content>
      <div class="mx-auto max-h-[85dvh] w-full max-w-lg overflow-y-auto px-5 pb-8 pt-4">
        <!-- Header -->
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-white">{{ routine ? 'Edit PT Routine' : 'New PT Routine' }}</h3>
          <button
            class="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            aria-label="Close"
            @click="isOpen = false"
          >
            <UIcon name="i-lucide-x" class="size-5" />
          </button>
        </div>

        <!-- Routine name -->
        <label for="pt-routine-name" class="mb-1.5 block text-sm font-medium text-slate-300">
          Routine name
        </label>
        <input
          id="pt-routine-name"
          v-model="name"
          data-testid="routine-name"
          type="text"
          maxlength="100"
          placeholder="e.g. Knee Rehab"
          class="mb-5 w-full rounded-lg bg-slate-800 px-4 py-3 text-white outline-none ring-1 ring-slate-700 transition-shadow focus:ring-2 focus:ring-violet-500"
        >

        <!-- Exercise rows -->
        <div class="space-y-3">
          <div
            v-for="(draft, index) in drafts"
            :key="index"
            class="rounded-lg bg-slate-800/40 p-3 ring-1 ring-slate-800"
          >
            <div class="mb-2 flex items-center gap-1.5">
              <span class="text-sm font-semibold text-violet-400">{{ index + 1 }}.</span>
              <input
                v-model="draft.title"
                data-testid="exercise-title"
                type="text"
                maxlength="100"
                placeholder="Exercise title"
                class="min-w-0 flex-1 rounded-lg bg-slate-800 px-3 py-2 text-sm text-white outline-none ring-1 ring-slate-700 transition-shadow focus:ring-2 focus:ring-violet-500"
              >
              <button
                class="rounded p-1.5 text-slate-500 transition-colors hover:text-white disabled:opacity-30"
                aria-label="Move up"
                :disabled="index === 0"
                @click="moveExercise(index, -1)"
              >
                <UIcon name="i-lucide-chevron-up" class="size-4" />
              </button>
              <button
                class="rounded p-1.5 text-slate-500 transition-colors hover:text-white disabled:opacity-30"
                aria-label="Move down"
                :disabled="index === drafts.length - 1"
                @click="moveExercise(index, 1)"
              >
                <UIcon name="i-lucide-chevron-down" class="size-4" />
              </button>
              <button
                class="rounded p-1.5 text-slate-500 transition-colors hover:text-red-400"
                aria-label="Remove exercise"
                @click="removeExercise(index)"
              >
                <UIcon name="i-lucide-trash-2" class="size-4" />
              </button>
            </div>
            <div class="flex items-center gap-2">
              <div class="flex overflow-hidden rounded-lg ring-1 ring-slate-700">
                <button
                  type="button"
                  data-testid="measure-reps"
                  class="px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="draft.measure === 'reps' ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'"
                  @click="setMeasure(draft, 'reps')"
                >
                  Reps
                </button>
                <button
                  type="button"
                  data-testid="measure-duration"
                  class="px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="draft.measure === 'duration' ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'"
                  @click="setMeasure(draft, 'duration')"
                >
                  Seconds
                </button>
              </div>
              <input
                v-model.number="draft.value"
                data-testid="exercise-value"
                type="number"
                inputmode="numeric"
                min="1"
                :max="draft.measure === 'reps' ? 1000 : 3600"
                :placeholder="draft.measure === 'reps' ? 'Reps' : 'Seconds'"
                :aria-label="draft.measure === 'reps' ? 'Reps' : 'Duration in seconds'"
                class="w-24 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white outline-none ring-1 ring-slate-700 transition-shadow focus:ring-2 focus:ring-violet-500"
              >
            </div>
          </div>
        </div>

        <!-- Add exercise -->
        <button
          type="button"
          data-testid="add-exercise"
          class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium text-violet-400 ring-1 ring-dashed ring-slate-700 transition-colors hover:bg-slate-800/60 disabled:opacity-40"
          :disabled="drafts.length >= 50"
          @click="addExercise"
        >
          <UIcon name="i-lucide-plus" class="size-4" />
          Add Exercise
        </button>

        <!-- Save -->
        <UButton
          color="primary"
          size="lg"
          block
          class="mt-5 py-4 text-base"
          data-testid="save-routine"
          :loading="saving"
          :disabled="!canSave"
          @click="handleSave"
        >
          Save Routine
        </UButton>
      </div>
    </template>
  </UDrawer>
</template>
