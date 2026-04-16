<script setup lang="ts">
import type { EditingContext } from '~/types/workout'

definePageMeta({ layout: 'app' })

const route = useRoute()
const router = useRouter()
const sessionId = computed(() => route.params.id as string)

const {
  session, day, completedSets, completing, abandoning, recordingSetId,
  totalSets, completedSetCount, progressPercent,
  loadActiveSession, recordSet, updateSet, deleteCompletedSet,
  extraCompletedSets, exerciseSwaps, notesSaving,
  addExtraSet, deleteExtraSet, updateExtraSet, saveWorkoutNotes,
  swapExercise, completeWorkout, abandonWorkout,
} = useWorkoutSession()

const pageLoading = ref(true)
const pageError = ref<string | null>(null)
const programCompleted = ref(false)
const endDialogOpen = ref(false)
const completeDialogOpen = ref(false)

// Set log drawer state
const editingContext = ref<EditingContext | null>(null)

// Exercise swap drawer state
const swapDrawerOpen = ref(false)
const swappingProgramExerciseId = ref<string | null>(null)

onMounted(async () => {
  try {
    const found = await loadActiveSession()
    if (!found || session.value?.id !== sessionId.value) {
      await router.replace('/')
      return
    }
  } catch {
    pageError.value = 'Failed to load workout session'
  } finally {
    pageLoading.value = false
  }
})

// Computed helpers for drawer bindings to avoid TypeScript narrowing issues in templates
const editingCompletedSet = computed(() => {
  const ctx = editingContext.value
  if (!ctx) return null
  if (ctx.type === 'template') return completedSets.value.get(ctx.exerciseSetId) ?? null
  return extraCompletedSets.value.get(ctx.completedSetId) ?? null
})

const editingCanDelete = computed(() => {
  const ctx = editingContext.value
  if (!ctx) return false
  if (ctx.type === 'template') return completedSets.value.has(ctx.exerciseSetId)
  return true
})

// Find the full set detail object for the currently-editing set
const editingSet = computed(() => {
  if (!editingContext.value || !day.value) return null
  const ctx = editingContext.value

  if (ctx.type === 'template') {
    for (const group of day.value.exerciseGroups) {
      for (const ex of group.exercises) {
        const found = ex.sets.find(s => s.id === ctx.exerciseSetId)
        if (found) return found
      }
    }
    return null
  }

  // Extra set — synthesize a minimal set object
  const existing = extraCompletedSets.value.get(ctx.completedSetId)
  const peId = ctx.programExerciseId
  let templateSetCount = 0
  if (day.value) {
    for (const group of day.value.exerciseGroups) {
      const ex = group.exercises.find(e => e.id === peId)
      if (ex) { templateSetCount = ex.sets.length; break }
    }
  }
  const priorExtra = Array.from(extraCompletedSets.value.values())
    .filter(s => s.programExerciseId === peId && s.id !== ctx.completedSetId)
    .length
  return {
    id: ctx.completedSetId,
    setNumber: templateSetCount + priorExtra + 1,
    reps: existing?.reps ?? null,
    weight: existing?.weight ?? null,
    rpe: existing?.rpe ?? null,
    notes: existing?.notes ?? null,
    effortTarget: null,
  }
})

function handleEdit(context: EditingContext): void {
  editingContext.value = context
}

function cancelEdit(): void {
  editingContext.value = null
}

async function handleLog(reps: number | null, weight: number | null): Promise<void> {
  const ctx = editingContext.value
  if (!ctx) return
  editingContext.value = null

  if (ctx.type === 'template') {
    const existing = completedSets.value.get(ctx.exerciseSetId)
    if (existing) {
      await updateSet(ctx.exerciseSetId, { reps, weight })
    } else {
      await recordSet(ctx.exerciseSetId, { reps, weight })
    }
  } else {
    await updateExtraSet(ctx.completedSetId, { reps, weight })
  }
}

async function handleDelete(): Promise<void> {
  const ctx = editingContext.value
  if (!ctx) return
  editingContext.value = null

  if (ctx.type === 'template') {
    await deleteCompletedSet(ctx.exerciseSetId)
  } else {
    await deleteExtraSet(ctx.completedSetId)
  }
}

async function handleAddExtraSet(programExerciseId: string): Promise<void> {
  const newSet = await addExtraSet(programExerciseId, {})
  editingContext.value = { type: 'extra', completedSetId: newSet.id, programExerciseId }
}

function handleSwap(programExerciseId: string): void {
  swappingProgramExerciseId.value = programExerciseId
  swapDrawerOpen.value = true
}

async function confirmSwap(replacementExerciseId: string): Promise<void> {
  if (!swappingProgramExerciseId.value) return
  await swapExercise(swappingProgramExerciseId.value, replacementExerciseId)
  swapDrawerOpen.value = false
  swappingProgramExerciseId.value = null
}

async function confirmComplete(): Promise<void> {
  try {
    const result = await completeWorkout()
    completeDialogOpen.value = false
    if (result.programCompleted) {
      programCompleted.value = true
    } else {
      await router.push('/')
    }
  } catch {
    // Error is handled by completing state resetting
  }
}

async function handlePause(): Promise<void> {
  endDialogOpen.value = false
  await router.push('/')
}

async function handleDiscard(): Promise<void> {
  try {
    await abandonWorkout()
    endDialogOpen.value = false
    await router.push('/')
  } catch {
    // Error handled by abandoning state
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Loading -->
    <div v-if="pageLoading" class="space-y-4">
      <div class="h-8 w-48 animate-pulse rounded bg-slate-800" />
      <div class="h-4 w-full animate-pulse rounded bg-slate-800" />
      <div v-for="n in 3" :key="n" class="h-32 animate-pulse rounded-lg bg-slate-800" />
    </div>

    <!-- Error -->
    <UAlert v-else-if="pageError" color="error" variant="subtle" :title="pageError" icon="i-lucide-alert-circle" />

    <!-- Program completed celebration -->
    <div v-else-if="programCompleted" class="flex flex-col items-center gap-6 py-12 text-center">
      <div class="text-6xl">
        🎉
      </div>
      <h2 class="text-2xl font-bold text-white">
        Program Complete!
      </h2>
      <p class="text-slate-400">
        Congratulations! You've finished every workout in this program.
      </p>
      <UButton color="primary" size="lg" @click="router.push('/')">
        Back to Home
      </UButton>
    </div>

    <!-- Workout session -->
    <template v-else-if="session && day">
      <!-- Header -->
      <div class="flex items-center gap-3">
        <NuxtLink to="/">
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            size="sm"
          />
        </NuxtLink>
        <h2 class="text-lg font-semibold text-white">
          Week {{ session.weekNumber }}, Day {{ session.dayNumber }}
        </h2>
      </div>

      <!-- Progress bar -->
      <div class="space-y-1">
        <div class="flex items-center justify-between text-xs text-slate-400">
          <span>Progress</span>
          <span>{{ completedSetCount }} / {{ totalSets }} sets</span>
        </div>
        <div class="h-3 overflow-hidden rounded-full bg-slate-800">
          <div
            class="h-full rounded-full bg-violet-600 transition-all duration-300"
            :style="{ width: `${progressPercent}%` }"
          />
        </div>
      </div>

      <!-- Warm-up -->
      <div v-if="day.warmUp" class="rounded-lg bg-amber-500/10 px-3 py-2.5">
        <p class="text-[10px] font-medium text-amber-500/70">Warm-up</p>
        <p class="mt-0.5 text-sm text-amber-400">{{ day.warmUp }}</p>
      </div>

      <!-- Exercise groups -->
      <div class="space-y-3">
        <WorkoutExerciseCard
          v-for="group in day.exerciseGroups"
          :key="group.id"
          :group="group"
          :completed-sets="completedSets"
          :extra-completed-sets="extraCompletedSets"
          :exercise-swaps="exerciseSwaps"
          :editable="true"
          :recording-set-id="recordingSetId"
          @edit="handleEdit"
          @add-extra-set="handleAddExtraSet"
          @swap="handleSwap"
        />
      </div>

      <!-- Workout Notes -->
      <div class="rounded-lg bg-slate-800/50 p-3">
        <label for="workout-notes" class="mb-1.5 block text-xs font-medium text-slate-400">
          Workout Notes
        </label>
        <textarea
          id="workout-notes"
          :value="session.notes ?? ''"
          rows="3"
          placeholder="Add notes for this workout..."
          class="w-full resize-none bg-transparent text-base text-white placeholder-slate-600 outline-none"
          @input="saveWorkoutNotes(($event.target as HTMLTextAreaElement).value)"
          @blur="saveWorkoutNotes(($event.target as HTMLTextAreaElement).value)"
        />
        <p class="mt-0.5 text-right text-xs text-slate-600">
          <span v-if="notesSaving" class="text-slate-500">Saving...</span>
        </p>
      </div>

      <!-- Action buttons -->
      <div class="flex gap-3">
        <UButton
          color="neutral"
          variant="outline"
          size="lg"
          class="flex-1 justify-center py-5 text-base"
          @click="endDialogOpen = true"
        >
          End
        </UButton>
        <UButton
          color="primary"
          size="lg"
          class="flex-1 justify-center py-5 text-base"
          :loading="completing"
          @click="completeDialogOpen = true"
        >
          Complete
        </UButton>
      </div>
    </template>

    <!-- Set log drawer -->
    <WorkoutSetLogDrawer
      v-if="editingSet"
      :open="editingContext !== null"
      :set="editingSet"
      :completed-set="editingCompletedSet"
      :loading="recordingSetId !== null"
      :can-delete="editingCanDelete"
      @log="(reps, weight) => handleLog(reps, weight)"
      @close="cancelEdit"
      @delete="handleDelete"
    />

    <!-- Exercise swap drawer -->
    <WorkoutExerciseSwapDrawer
      v-if="swapDrawerOpen && swappingProgramExerciseId && day"
      :open="swapDrawerOpen"
      :program-exercise-id="swappingProgramExerciseId"
      :exercise-swaps="exerciseSwaps"
      :day="day"
      :completed-sets="completedSets"
      :extra-completed-sets="extraCompletedSets"
      @confirm="confirmSwap"
      @close="swapDrawerOpen = false; swappingProgramExerciseId = null"
    />

    <!-- End Workout Modal -->
    <UModal v-model:open="endDialogOpen" title="End Workout" description="What would you like to do with this session?">
      <template #body>
        <div class="flex flex-col gap-3">
          <UButton
            color="neutral"
            variant="soft"
            size="lg"
            block
            icon="i-lucide-pause"
            @click="handlePause"
          >
            Pause &amp; Resume Later
          </UButton>
          <UButton
            color="error"
            variant="soft"
            size="lg"
            block
            icon="i-lucide-trash-2"
            :loading="abandoning"
            @click="handleDiscard"
          >
            Discard Workout
          </UButton>
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          block
          class="mt-4"
          @click="endDialogOpen = false"
        >
          Cancel
        </UButton>
      </template>
    </UModal>

    <!-- Complete Workout Modal -->
    <UModal v-model:open="completeDialogOpen" title="Complete Workout" description="Mark this workout as complete and advance to the next day?">
      <template #body>
        <div class="flex justify-end gap-3">
          <UButton color="neutral" variant="ghost" @click="completeDialogOpen = false">
            Cancel
          </UButton>
          <UButton color="primary" :loading="completing" @click="confirmComplete">
            Complete
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
