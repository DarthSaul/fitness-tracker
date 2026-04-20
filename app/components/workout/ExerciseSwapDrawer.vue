<script setup lang="ts">
import { VisuallyHidden, DialogTitle, DialogDescription } from 'reka-ui'
import type { WorkoutExerciseSwap, CompletedSetRecord } from '~/types/workout'
import type { ProgramDayDetail, ExerciseSummary } from '~/types/program'

const props = defineProps<{
  open: boolean
  programExerciseId: string | null
  exerciseSwaps: WorkoutExerciseSwap[]
  day: ProgramDayDetail
  completedSets: Map<string, CompletedSetRecord>
  extraCompletedSets: Map<string, CompletedSetRecord>
  confirmLoading?: boolean
}>()

const emit = defineEmits<{
  confirm: [replacementExerciseId: string]
  close: []
}>()

const isOpen = computed({
  get: () => props.open,
  set: (v: boolean) => { if (!v) emit('close') },
})

const search = ref('')
const exercises = ref<ExerciseSummary[]>([])
const exercisesLoading = ref(false)
const exercisesError = ref(false)
const pendingSelection = ref<ExerciseSummary | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)

// Fetch exercises when drawer opens
watch(() => props.open, async (opened) => {
  if (opened) {
    search.value = ''
    pendingSelection.value = null
    exercisesLoading.value = true
    exercisesError.value = false
    try {
      exercises.value = await $fetch<ExerciseSummary[]>('/api/exercises')
    } catch {
      exercises.value = []
      exercisesError.value = true
    } finally {
      exercisesLoading.value = false
      if (!props.open) return
      await nextTick()
      searchInputRef.value?.focus()
    }
  }
})

const currentExerciseId = computed(() => {
  for (const group of props.day.exerciseGroups) {
    for (const e of group.exercises) {
      if (e.id === props.programExerciseId) return e.exercise.id
    }
  }
  return null
})

const filteredExercises = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = exercises.value.filter(e => e.id !== currentExerciseId.value)
  if (!q) return list
  return list.filter(e => e.name.toLowerCase().includes(q))
})

const currentExerciseName = computed(() => {
  if (!props.programExerciseId || !props.day) return ''
  for (const group of props.day.exerciseGroups) {
    const ex = group.exercises.find(e => e.id === props.programExerciseId)
    if (ex) return ex.exercise.name
  }
  return ''
})

const loggedSetCount = computed(() => {
  if (!props.programExerciseId || !props.day) return 0
  let count = 0
  for (const group of props.day.exerciseGroups) {
    const ex = group.exercises.find(e => e.id === props.programExerciseId)
    if (ex) {
      count += ex.sets.filter(s => props.completedSets.has(s.id)).length
      count += [...props.extraCompletedSets.values()]
        .filter(cs => cs.programExerciseId === props.programExerciseId).length
      break
    }
  }
  return count
})

function selectExercise(exercise: ExerciseSummary): void {
  if (exercise.id === currentExerciseId.value) return
  if (loggedSetCount.value === 0) {
    // No logged sets — confirm immediately
    emit('confirm', exercise.id)
  } else {
    // Show warning
    pendingSelection.value = exercise
  }
}

function confirmSwap(): void {
  if (!pendingSelection.value) return
  emit('confirm', pendingSelection.value.id)
}
</script>

<template>
  <UDrawer v-model:open="isOpen" direction="bottom">
    <template #content>
      <div class="mx-auto w-full max-w-lg px-5 pb-8 pt-4">
        <!-- Header -->
        <div class="mb-4 flex items-center justify-between">
          <DialogTitle as="h3" class="text-lg font-semibold text-white">
            Swap Exercise
          </DialogTitle>
          <button
            class="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            aria-label="Close"
            @click="emit('close')"
          >
            <UIcon name="i-lucide-x" class="size-5" />
          </button>
        </div>

        <VisuallyHidden>
          <DialogDescription>Search for an exercise to replace {{ currentExerciseName }}</DialogDescription>
        </VisuallyHidden>

        <!-- Current exercise -->
        <p class="mb-4 text-sm text-slate-400">
          Replacing: <span class="font-medium text-slate-200">{{ currentExerciseName }}</span>
        </p>

        <!-- Confirmation warning -->
        <div v-if="pendingSelection" class="mb-4 rounded-lg bg-amber-500/10 p-4">
          <p class="mb-3 text-sm text-amber-300">
            Swapping to <strong>{{ pendingSelection.name }}</strong> will delete
            {{ loggedSetCount }} logged set{{ loggedSetCount === 1 ? '' : 's' }} for
            <strong>{{ currentExerciseName }}</strong>. This cannot be undone.
          </p>
          <div class="flex gap-2">
            <UButton
              color="neutral"
              variant="soft"
              size="sm"
              @click="pendingSelection = null"
            >
              Cancel
            </UButton>
            <UButton
              color="warning"
              size="sm"
              :loading="confirmLoading"
              @click="confirmSwap"
            >
              Confirm Swap
            </UButton>
          </div>
        </div>

        <!-- Search + exercise list -->
        <div v-else>
          <input
            ref="searchInputRef"
            v-model="search"
            type="text"
            inputmode="search"
            placeholder="Search exercises..."
            class="mb-3 w-full rounded-lg bg-slate-800 px-4 py-3 text-base text-white placeholder-slate-500 outline-none ring-1 ring-slate-700 focus:ring-violet-500"
          >

          <!-- Exercise list -->
          <div v-if="exercisesLoading" class="space-y-2">
            <div v-for="n in 5" :key="n" class="h-10 animate-pulse rounded-lg bg-slate-800" />
          </div>
          <div v-else-if="exercisesError" class="py-8 text-center text-sm text-red-400">
            Failed to load exercises. Please close and try again.
          </div>
          <div v-else class="max-h-64 overflow-y-auto space-y-1">
            <button
              v-for="exercise in filteredExercises"
              :key="exercise.id"
              type="button"
              class="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-white transition-colors hover:bg-slate-700/60 active:bg-slate-700"
              @click="selectExercise(exercise)"
            >
              {{ exercise.name }}
            </button>
            <p v-if="filteredExercises.length === 0" class="py-4 text-center text-sm text-slate-500">
              No exercises found
            </p>
          </div>
        </div>
      </div>
    </template>
  </UDrawer>
</template>
