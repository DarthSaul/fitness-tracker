/**
 * Editor for one program workout session, loaded by id alone — it needs no
 * active program, so a finished workout stays editable in isolation.
 *
 * Handles both states a non-live session can be in:
 *  - EDITING   (logged retroactively, not yet saved): pick a date, log sets,
 *              then Save to complete it, or discard it.
 *  - COMPLETED (history): every change persists immediately, including the date.
 *
 * Used by the program day page and by History → Edit.
 */
<script setup lang="ts">
import type { WorkoutSession } from '~/types/workout'

const props = defineProps<{
  sessionId: string
}>()

const emit = defineEmits<{
  /** The session finished loading (or reloaded after a swap). */
  loaded: [session: WorkoutSession]
  /** An EDITING session was saved as complete. */
  saved: []
  /** An EDITING session was discarded. */
  discarded: []
}>()

const workout = useWorkoutSession()
const {
  session, day, completedSets, extraCompletedSets, exerciseSwaps, adHocGroups,
  completing, abandoning, recordingSetId,
  totalSets, completedSetCount, progressPercent,
  loadSession, addAdHocSet, updateCompletedAt, swapExercise, completeWorkout, abandonWorkout,
} = workout

const {
  editingContext, editingSet, completedSet, isSwapped, canDelete,
  handleEdit, cancelEdit, handleLog, handleDelete, handleAddExtraSet,
} = useSetEditing(workout)

const toast = useToast()

const loading = ref(true)
const loadError = ref<string | null>(null)
const discardDialogOpen = ref(false)
const saveDialogOpen = ref(false)
const addExerciseDrawerOpen = ref(false)
const swapDrawerOpen = ref(false)
const swappingProgramExerciseId = ref<string | null>(null)
const swapConfirming = ref(false)
const dateSaving = ref(false)

function toLocalDateString(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const dayNum = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${dayNum}`
}

const todayLocal = toLocalDateString(new Date())
const workoutDate = ref(todayLocal)

function syncDateFromSession(): void {
  const source = session.value?.completedAt ?? session.value?.startedAt
  if (source) workoutDate.value = toLocalDateString(new Date(source))
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    const found = await loadSession(props.sessionId)
    if (!found || !session.value) {
      loadError.value = 'Workout not found'
      return
    }
    syncDateFromSession()
    emit('loaded', session.value)
  } catch {
    loadError.value = 'Failed to load workout data'
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => props.sessionId, load)

function notifyFailure(title: string): void {
  toast.add({ title, color: 'error', icon: 'i-lucide-circle-alert' })
}

/** Runs an edit and surfaces a failure instead of leaving the UI silently stale. */
async function attempt(action: () => Promise<void>, failureTitle: string): Promise<void> {
  try {
    await action()
  } catch {
    notifyFailure(failureTitle)
  }
}

/** A finished session saves its date straight away; an EDITING one sends it on Save. */
async function onDateChange(): Promise<void> {
  if (session.value?.status !== 'COMPLETED') return
  dateSaving.value = true
  try {
    await updateCompletedAt(workoutDate.value)
  } catch {
    notifyFailure('Couldn\'t update the workout date')
  } finally {
    // Reflects the saved value — including a clamp to today, or a revert on failure
    syncDateFromSession()
    dateSaving.value = false
  }
}

async function handleExerciseSelected(exerciseName: string): Promise<void> {
  addExerciseDrawerOpen.value = false
  const results = await Promise.allSettled([
    addAdHocSet(exerciseName),
    addAdHocSet(exerciseName),
    addAdHocSet(exerciseName),
  ])
  if (results.some(r => r.status === 'rejected')) {
    notifyFailure('Some sets could not be added. Please try again.')
  }
}

function handleSwap(programExerciseId: string): void {
  swappingProgramExerciseId.value = programExerciseId
  swapDrawerOpen.value = true
}

function closeSwapDrawer(): void {
  swapDrawerOpen.value = false
  swappingProgramExerciseId.value = null
}

async function confirmSwap(replacementExerciseId: string): Promise<void> {
  if (!swappingProgramExerciseId.value) return
  swapConfirming.value = true
  try {
    await swapExercise(swappingProgramExerciseId.value, replacementExerciseId)
    closeSwapDrawer()
    if (session.value) emit('loaded', session.value)
  } catch {
    notifyFailure('Couldn\'t swap the exercise')
  } finally {
    swapConfirming.value = false
  }
}

async function confirmSave(): Promise<void> {
  saveDialogOpen.value = false
  try {
    const completedAt = workoutDate.value
      ? new Date(workoutDate.value + 'T12:00:00').toISOString()
      : null
    await completeWorkout(completedAt)
  } catch {
    notifyFailure('Failed to save workout')
    return
  }
  emit('saved')
}

async function confirmDiscard(): Promise<void> {
  try {
    await abandonWorkout()
    discardDialogOpen.value = false
    emit('discarded')
  } catch {
    discardDialogOpen.value = false
    notifyFailure('Failed to discard session')
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Loading -->
    <template v-if="loading">
      <AppSkeleton :height="40" />
      <AppSkeleton :height="16" width="100%" />
      <AppSkeleton :height="128" :count="3" />
    </template>

    <!-- Error -->
    <UAlert v-else-if="loadError" color="error" variant="subtle" :title="loadError" icon="i-lucide-alert-circle" />

    <template v-else-if="session && day">
      <!-- Date picker -->
      <div class="flex items-center gap-3 rounded-tile bg-surface px-3 py-2.5">
        <UIcon name="i-lucide-calendar" class="size-4 text-label-secondary" />
        <label for="workout-date" class="text-subheadline text-label-secondary">Date</label>
        <input
          id="workout-date"
          v-model="workoutDate"
          type="date"
          :max="todayLocal"
          :disabled="dateSaving"
          class="flex-1 bg-transparent text-subheadline tnum text-label outline-none disabled:opacity-50"
          @change="onDateChange"
        >
        <UButton
          v-if="session.status === 'EDITING'"
          color="error"
          variant="ghost"
          size="sm"
          icon="i-lucide-trash-2"
          aria-label="Discard session"
          :loading="abandoning"
          @click="discardDialogOpen = true"
        />
      </div>

      <!-- Completed badge -->
      <div v-if="session.status === 'COMPLETED'" class="flex items-center gap-2 rounded-tile bg-ios-green/15 px-3 py-2 text-subheadline text-ios-green">
        <UIcon name="i-lucide-check-circle" class="size-4" />
        Workout completed — changes save as you make them
      </div>

      <!-- Progress bar -->
      <div class="space-y-1">
        <div class="flex items-center justify-between text-caption text-label-secondary">
          <span>Progress</span>
          <span class="tnum">{{ completedSetCount }} / {{ totalSets }} sets</span>
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
        <p class="mt-0.5 text-subheadline text-ios-orange">{{ day.warmUp }}</p>
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
          @add-extra-set="(peId) => attempt(() => handleAddExtraSet(peId), 'Couldn\'t add the set')"
          @swap="handleSwap"
        />
        <WorkoutAdHocExerciseCard
          v-for="group in adHocGroups"
          :key="group.exerciseName"
          :group="group"
          :editable="true"
          @log-set="(completedSetId) => handleEdit({ type: 'adhoc', completedSetId })"
          @add-set="(name) => attempt(async () => { await addAdHocSet(name) }, 'Couldn\'t add the set')"
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

      <!-- Save button (only for EDITING sessions) -->
      <div v-if="session.status === 'EDITING'" class="pt-4 pb-2">
        <UButton
          color="primary"
          size="lg"
          block
          class="py-5 text-body"
          :loading="completing"
          @click="saveDialogOpen = true"
        >
          Save
        </UButton>
      </div>

      <!-- Set log drawer -->
      <WorkoutSetLogDrawer
        v-if="editingSet"
        :open="editingContext !== null"
        :set="editingSet"
        :completed-set="completedSet"
        :loading="recordingSetId !== null"
        :can-delete="canDelete"
        :is-swapped="isSwapped"
        @log="(reps, weight) => attempt(() => handleLog(reps, weight), 'Couldn\'t save the set')"
        @delete="attempt(handleDelete, 'Couldn\'t delete the set')"
        @close="cancelEdit"
      />

      <!-- Add exercise group drawer -->
      <WorkoutExerciseSearchDrawer
        :open="addExerciseDrawerOpen"
        @select="handleExerciseSelected"
        @close="addExerciseDrawerOpen = false"
      />

      <!-- Exercise swap drawer -->
      <WorkoutExerciseSwapDrawer
        v-if="swapDrawerOpen && swappingProgramExerciseId"
        :open="swapDrawerOpen"
        :program-exercise-id="swappingProgramExerciseId"
        :exercise-swaps="exerciseSwaps"
        :day="day"
        :completed-sets="completedSets"
        :extra-completed-sets="extraCompletedSets"
        :confirm-loading="swapConfirming"
        @confirm="confirmSwap"
        @close="closeSwapDrawer"
      />
    </template>

    <!-- Discard confirmation dialog -->
    <UModal v-model:open="discardDialogOpen" title="Discard Session" description="Discard this session and all logged sets?">
      <template #body>
        <div class="flex justify-end gap-3">
          <UButton color="neutral" variant="ghost" @click="discardDialogOpen = false">
            Cancel
          </UButton>
          <UButton color="error" :loading="abandoning" @click="confirmDiscard">
            Discard
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Save confirmation dialog -->
    <UModal v-model:open="saveDialogOpen" title="Save Workout" description="Mark this workout as complete?">
      <template #body>
        <div class="flex justify-end gap-3">
          <UButton color="neutral" variant="ghost" @click="saveDialogOpen = false">
            Cancel
          </UButton>
          <UButton color="primary" :loading="completing" @click="confirmSave">
            Save
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
