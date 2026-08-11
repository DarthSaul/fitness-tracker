<script setup lang="ts">
import type { EditingContext, AdHocExerciseGroup } from '~/types/workout'

interface ExerciseCardHandle { collapseAll: () => void }

definePageMeta({ layout: 'fullscreen' })

const route = useRoute()
const router = useRouter()
const sessionId = computed(() => route.params.id as string)

const {
  session, day, completedSets, completing, abandoning, recordingSetId,
  totalSets, completedSetCount, progressPercent,
  loadActiveSession, recordSet, updateSet, deleteCompletedSet,
  extraCompletedSets, exerciseSwaps, adHocGroups, notesSaving,
  addExtraSet, deleteExtraSet, updateExtraSet, addAdHocSet, saveWorkoutNotes,
  swapExercise, completeWorkout, abandonWorkout,
} = useWorkoutSession()

const toast = useToast()
const exerciseCardRefs = ref<(ExerciseCardHandle | null)[]>([])
const completingGroupIdx = ref<number | null>(null)

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
const swapConfirming = ref(false)

// Add exercise group drawer state
const addExerciseDrawerOpen = ref(false)

// PT routine drawer state — button shows only when the profile toggle is on
// and the user has at least one routine
const { enabled: ptEnabled, status: ptSettingStatus } = usePtRoutineSetting()
const { routines: ptRoutines, status: ptRoutinesStatus } = usePtRoutines()
const ptLoading = computed(() => ptSettingStatus.value === 'pending' || ptRoutinesStatus.value === 'pending')
const ptDrawerOpen = ref(false)
const restTimerOpen = ref(false)

function openPtDrawer(): void {
  ptDrawerOpen.value = true
}

// Workout notes panel state
const workoutNotesOpen = ref(false)

// Local draft for workout notes — prevents textarea revert on re-render
const notesDraft = ref('')
watch(() => session.value?.notes, (notes) => {
  notesDraft.value = notes ?? ''
}, { immediate: true })

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
  if (ctx.type === 'extra') return extraCompletedSets.value.get(ctx.completedSetId) ?? null
  if (ctx.type === 'adhoc') return extraCompletedSets.value.get(ctx.completedSetId) ?? null
  return null
})

const editingIsSwapped = computed(() => {
  const ctx = editingContext.value
  if (!ctx || ctx.type !== 'template' || !day.value) return false
  for (const group of day.value.exerciseGroups) {
    for (const ex of group.exercises) {
      if (ex.sets.some(s => s.id === ctx.exerciseSetId)) {
        return exerciseSwaps.value.some(swap => swap.programExerciseId === ex.id)
      }
    }
  }
  return false
})

const editingCanDelete = computed(() => {
  const ctx = editingContext.value
  if (!ctx) return false
  if (ctx.type === 'template') return completedSets.value.has(ctx.exerciseSetId)
  return true
})

// Find the full set detail object for the currently-editing set
const editingSet = computed(() => {
  if (!editingContext.value) return null
  const ctx = editingContext.value
  if (ctx.type === 'template') {
    if (!day.value) return null
    for (const group of day.value.exerciseGroups) {
      for (const ex of group.exercises) {
        const found = ex.sets.find(s => s.id === ctx.exerciseSetId)
        if (found) return found
      }
    }
    return null
  }

  if (ctx.type === 'extra') {
    if (!day.value) return null
    const existing = extraCompletedSets.value.get(ctx.completedSetId)
    const peId = ctx.programExerciseId
    let templateSetCount = 0
    for (const group of day.value.exerciseGroups) {
      const ex = group.exercises.find(e => e.id === peId)
      if (ex) { templateSetCount = ex.sets.length; break }
    }
    const extrasForExercise = Array.from(extraCompletedSets.value.values())
      .filter(s => s.programExerciseId === peId)
    const extraIndex = extrasForExercise.findIndex(s => s.id === ctx.completedSetId)
    return {
      id: ctx.completedSetId,
      setNumber: templateSetCount + (extraIndex >= 0 ? extraIndex + 1 : extrasForExercise.length + 1),
      reps: existing?.reps ?? null,
      weight: existing?.weight ?? null,
      rpe: existing?.rpe ?? null,
      notes: existing?.notes ?? null,
      effortTarget: null,
    }
  }

  if (ctx.type === 'adhoc') {
    const cs = extraCompletedSets.value.get(ctx.completedSetId)
    if (!cs) return null
    const group = adHocGroups.value.find((g: AdHocExerciseGroup) => g.sets.some(s => s.id === ctx.completedSetId))
    const setNumber = group ? group.sets.findIndex(s => s.id === ctx.completedSetId) + 1 : 1
    return {
      id: ctx.completedSetId,
      setNumber,
      reps: cs.reps,
      weight: cs.weight,
      rpe: cs.rpe,
      notes: cs.notes,
      effortTarget: null,
    }
  }

  return null
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
  } else if (ctx.type === 'extra') {
    await updateExtraSet(ctx.completedSetId, { reps, weight })
  } else if (ctx.type === 'adhoc') {
    await updateExtraSet(ctx.completedSetId, { reps, weight })
  }
}

async function handleDelete(): Promise<void> {
  const ctx = editingContext.value
  if (!ctx) return
  editingContext.value = null

  if (ctx.type === 'template') {
    await deleteCompletedSet(ctx.exerciseSetId)
  } else if (ctx.type === 'extra') {
    await deleteExtraSet(ctx.completedSetId)
  } else if (ctx.type === 'adhoc') {
    await deleteExtraSet(ctx.completedSetId)
  }
}

async function handleAddExtraSet(programExerciseId: string): Promise<void> {
  const newSet = await addExtraSet(programExerciseId, {})
  editingContext.value = { type: 'extra', completedSetId: newSet.id, programExerciseId }
}

async function handleExerciseSelected(exerciseName: string): Promise<void> {
  addExerciseDrawerOpen.value = false
  const results = await Promise.allSettled([
    addAdHocSet(exerciseName),
    addAdHocSet(exerciseName),
    addAdHocSet(exerciseName),
  ])
  const failed = results.filter(r => r.status === 'rejected').length
  if (failed > 0) {
    console.warn(`[workout] Created ${3 - failed}/3 ad-hoc sets for "${exerciseName}"`)
  }
}

function handleAdHocLogSet(completedSetId: string): void {
  editingContext.value = { type: 'adhoc', completedSetId }
}

async function handleAdHocAddSet(exerciseName: string): Promise<void> {
  await addAdHocSet(exerciseName)
}

async function handleGroupComplete(completedGroupIdx: number): Promise<void> {
  // Guard against double-taps that would queue duplicate recordSet() writes
  if (completingGroupIdx.value !== null) return
  const groups = day.value?.exerciseGroups
  if (!groups) return

  completingGroupIdx.value = completedGroupIdx
  try {
    // Log unlogged visible sets so the checkmark and progress bar update.
    // Hidden sets on swapped exercises are excluded from totalSets, so also
    // skip them here to keep completedSetCount in sync with totalSets.
    const group = groups[completedGroupIdx]
    if (group) {
      const swappedIds = new Set(exerciseSwaps.value.map(s => s.programExerciseId))
      const promises: Promise<void>[] = []
      for (const ex of group.exercises) {
        const visibleSets = swappedIds.has(ex.id) ? ex.sets.slice(0, 3) : ex.sets
        for (const set of visibleSets) {
          if (!completedSets.value.has(set.id)) {
            promises.push(recordSet(set.id, { reps: null, weight: null }))
          }
        }
      }
      const results = await Promise.allSettled(promises)
      if (results.some(r => r.status === 'rejected')) {
        console.error('[handleGroupComplete] Some sets failed to log')
        toast.add({ title: 'Some sets could not be saved. Please try again.', color: 'error', icon: 'i-lucide-circle-alert' })
        return
      }
    }

    exerciseCardRefs.value[completedGroupIdx]?.collapseAll()
  } finally {
    completingGroupIdx.value = null
  }
}

function handleSwap(programExerciseId: string): void {
  swappingProgramExerciseId.value = programExerciseId
  swapDrawerOpen.value = true
}

async function confirmSwap(replacementExerciseId: string): Promise<void> {
  if (!swappingProgramExerciseId.value) return
  swapConfirming.value = true
  try {
    await swapExercise(swappingProgramExerciseId.value, replacementExerciseId)
    swapDrawerOpen.value = false
    swappingProgramExerciseId.value = null
  } finally {
    swapConfirming.value = false
  }
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
      <AppSkeleton :height="32" :width="192" />
      <AppSkeleton :height="16" width="100%" />
      <AppSkeleton :height="128" :count="3" />
    </div>

    <!-- Error -->
    <UAlert v-else-if="pageError" color="error" variant="subtle" :title="pageError" icon="i-lucide-alert-circle" />

    <!-- Program completed celebration -->
    <div v-else-if="programCompleted" class="flex flex-col items-center gap-6 py-12 text-center">
      <div class="text-6xl">
        🎉
      </div>
      <h2 class="text-2xl font-bold text-label">
        Program Complete!
      </h2>
      <p class="text-label-secondary">
        Congratulations! You've finished every workout in this program.
      </p>
      <UButton color="primary" size="lg" @click="router.push('/')">
        Back to Home
      </UButton>
    </div>

    <!--
      Workout session.

      One column on a phone. From `lg` the exercise flow takes the left column
      and the session chrome becomes a sticky control rail on the right, so the
      progress bar, rest timer and Complete button stay put while you scroll a
      long list of exercises — a single 1120px column of exercise cards would
      be worse than the phone layout, not better.

      `order-*` reproduces the phone order exactly; `lg:order-none` hands
      placement back to the grid. The wrapper uses `gap`, not `space-y`, which
      follows DOM order and would break under `order`.
    -->
    <template v-else-if="session && day">
      <div
        class="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-8"
      >
        <!-- Session chrome -->
        <div class="order-1 flex flex-col gap-4 lg:order-none lg:sticky lg:top-0 lg:col-start-2 lg:row-start-1">
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
            <h2 class="flex-1 text-title3 font-semibold">
              Week {{ session.weekNumber }}, Day {{ session.dayNumber }}
            </h2>
            <UButton
              icon="i-lucide-timer"
              color="neutral"
              variant="soft"
              size="sm"
              aria-label="Rest timer"
              @click="restTimerOpen = true"
            />
          </div>

          <!-- PT routines quick access -->
          <AppSkeleton v-if="ptLoading" :height="28" :width="112" />
          <UButton
            v-else-if="ptEnabled && (ptRoutines?.length ?? 0) > 0"
            icon="i-lucide-clipboard-list"
            color="neutral"
            variant="soft"
            size="xs"
            class="self-start"
            @click="openPtDrawer"
          >
            PT Routines
          </UButton>

          <!-- Progress bar -->
          <div class="space-y-1">
            <div class="flex items-center justify-between text-xs text-label-secondary">
              <span>Progress</span>
              <span>{{ completedSetCount }} / {{ totalSets }} sets</span>
            </div>
            <div class="h-3 overflow-hidden rounded-full bg-fill">
              <div
                class="h-full rounded-full bg-tint transition-all duration-300"
                :style="{ width: `${progressPercent}%` }"
              />
            </div>
          </div>

          <!-- Warm-up -->
          <div v-if="day.warmUp" class="rounded-tile bg-ios-orange/15 px-3 py-2.5">
            <p class="text-caption2 font-medium text-ios-orange/70">Warm-up</p>
            <p class="mt-0.5 text-sm text-ios-orange">{{ day.warmUp }}</p>
          </div>
        </div>

        <!-- Exercise flow -->
        <div class="order-2 flex flex-col gap-4 lg:order-none lg:col-start-1 lg:row-start-1 lg:row-span-2">
          <!-- Exercise groups -->
          <div class="space-y-3">
            <WorkoutExerciseCard
              v-for="(group, groupIdx) in day.exerciseGroups"
              :key="group.id"
              :ref="(el) => { if (el) (exerciseCardRefs as unknown as (ExerciseCardHandle | null)[])[groupIdx] = el as unknown as ExerciseCardHandle }"
              :group="group"
              :completed-sets="completedSets"
              :extra-completed-sets="extraCompletedSets"
              :exercise-swaps="exerciseSwaps"
              :editable="true"
              :recording-set-id="recordingSetId"
              :completing-group="completingGroupIdx === groupIdx"
              @edit="handleEdit"
              @add-extra-set="handleAddExtraSet"
              @swap="handleSwap"
              @group-complete="handleGroupComplete(groupIdx)"
            />
            <WorkoutAdHocExerciseCard
              v-for="group in adHocGroups"
              :key="group.exerciseName"
              :group="group"
              :editable="true"
              @log-set="handleAdHocLogSet"
              @add-set="handleAdHocAddSet"
            />
          </div>

          <!-- Add Exercise Group -->
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-plus"
            class="w-full justify-center py-3"
            @click="addExerciseDrawerOpen = true"
          >
            Add Exercise Group
          </UButton>

          <!-- Workout Notes -->
          <div class="rounded-tile bg-surface">
            <div
              role="button"
              tabindex="0"
              class="flex w-full items-center gap-3 rounded-tile px-3 py-3 text-left"
              @click="workoutNotesOpen = !workoutNotesOpen"
              @keydown.enter="workoutNotesOpen = !workoutNotesOpen"
              @keydown.space.prevent="workoutNotesOpen = !workoutNotesOpen"
            >
              <span class="flex-1 text-sm font-medium text-label">Workout Notes</span>
              <UIcon
                :name="workoutNotesOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                class="size-6 shrink-0 text-label-secondary"
              />
            </div>
            <div
              class="grid overflow-hidden transition-all duration-200 ease-in-out"
              :class="workoutNotesOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
            >
              <div class="min-h-0">
                <div class="border-t border-separator px-3 pb-3 pt-2">
                  <textarea
                    id="workout-notes"
                    :value="notesDraft"
                    rows="3"
                    placeholder="Add notes for this workout..."
                    class="w-full resize-none bg-transparent text-base text-label placeholder-label-tertiary outline-none"
                    @input="notesDraft = ($event.target as HTMLTextAreaElement).value; saveWorkoutNotes(notesDraft)"
                    @blur="saveWorkoutNotes(notesDraft)"
                  />
                  <p class="mt-0.5 text-right text-xs text-label-tertiary" :class="{ invisible: !notesSaving }">
                    Saving...
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!--
          Action buttons. Side by side under the flow on a phone; stacked at the
          foot of the rail on desktop, stuck to the bottom of the viewport so
          Complete stays reachable however long the exercise list runs.
        -->
        <div class="order-3 flex gap-3 lg:order-none lg:sticky lg:bottom-6 lg:col-start-2 lg:row-start-2 lg:flex-col lg:self-end">
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
      </div>
    </template>

    <!-- Rest timer. Always mounted so it keeps counting while dismissed. -->
    <WorkoutRestTimerSheet v-model:open="restTimerOpen" />

    <!-- PT routine drawer (read-only) -->
    <PtRoutineDrawer
      v-model:open="ptDrawerOpen"
      :routines="ptRoutines ?? []"
    />

    <!-- Set log drawer -->
    <WorkoutSetLogDrawer
      v-if="editingSet"
      :open="editingContext !== null"
      :set="editingSet"
      :completed-set="editingCompletedSet"
      :loading="recordingSetId !== null"
      :can-delete="editingCanDelete"
      :is-swapped="editingIsSwapped"
      @log="(reps, weight) => handleLog(reps, weight)"
      @close="cancelEdit"
      @delete="handleDelete"
    />

    <!-- Add exercise group drawer -->
    <WorkoutExerciseSearchDrawer
      :open="addExerciseDrawerOpen"
      @select="handleExerciseSelected"
      @close="addExerciseDrawerOpen = false"
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
      :confirm-loading="swapConfirming"
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
