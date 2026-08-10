/**
 * Live "Strength on the Go" session — the standalone counterpart to the
 * program workout screen, minus warm-ups, swaps and Core.
 */
<script setup lang="ts">
import type { StandaloneWorkoutSet } from '~/types/standalone'

definePageMeta({ layout: 'fullscreen' })

const route = useRoute()
const router = useRouter()

const {
  session,
  workout,
  loading,
  completing,
  abandoning,
  recordingSetId,
  error,
  totalSets,
  completedSetCount,
  progressPercent,
  isSetCompleted,
  getCompletedSet,
  loadSession,
  recordSet,
  deleteSet,
  completeSession,
  abandonSession,
} = useStandaloneSession()

const editingSet = ref<StandaloneWorkoutSet | null>(null)
const editReps = ref<number | null>(null)
const editWeight = ref<number | null>(null)
const completeOpen = ref(false)
const abandonOpen = ref(false)
const restTimerOpen = ref(false)

const logOpen = computed({
  get: () => editingSet.value !== null,
  set: (open: boolean) => {
    if (!open) editingSet.value = null
  },
})

onMounted(async () => {
  await loadSession(String(route.params.id))
})

function openLog(set: StandaloneWorkoutSet): void {
  const logged = getCompletedSet(set.id)
  editReps.value = logged?.reps ?? set.reps
  editWeight.value = logged?.weight ?? set.weight
  editingSet.value = set
}

async function saveLog(): Promise<void> {
  const set = editingSet.value
  if (!set) return
  editingSet.value = null
  await recordSet(set.id, {
    reps: Number.isFinite(editReps.value) ? editReps.value : null,
    weight: Number.isFinite(editWeight.value) ? editWeight.value : null,
  })
}

async function removeLog(): Promise<void> {
  const set = editingSet.value
  if (!set) return
  editingSet.value = null
  await deleteSet(set.id)
}

async function confirmComplete(): Promise<void> {
  await completeSession()
  completeOpen.value = false
  await router.push('/history')
}

async function confirmAbandon(): Promise<void> {
  await abandonSession()
  abandonOpen.value = false
  await router.push('/standalone-workouts')
}

function formatValue(value: number | null | undefined): string {
  return value == null ? '—' : String(value)
}
</script>

<template>
  <div class="space-y-4">
    <!-- Toolbar -->
    <div class="flex items-start gap-3">
      <button
        type="button"
        class="-ml-1 flex items-center gap-0.5 rounded-chip p-1 text-body text-tint"
        aria-label="Close workout"
        @click="router.back()"
      >
        <UIcon name="i-lucide-chevron-left" class="size-5" />
      </button>
      <div class="min-w-0 flex-1">
        <p class="truncate text-headline">{{ workout?.name ?? 'Workout' }}</p>
        <p class="text-caption2 text-label-secondary">Progress</p>
        <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-label-secondary/20">
          <div
            class="h-full rounded-full bg-ios-green transition-[width] duration-300"
            :style="{ width: `${progressPercent}%` }"
          />
        </div>
        <p class="mt-1 text-caption tnum text-label-secondary">
          {{ completedSetCount }} / {{ totalSets }} sets
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <UButton
          color="neutral"
          variant="soft"
          size="sm"
          icon="i-lucide-timer"
          aria-label="Rest timer"
          @click="restTimerOpen = true"
        />
        <UButton
          color="error"
          variant="ghost"
          size="sm"
          icon="i-lucide-trash-2"
          aria-label="Abandon workout"
          :loading="abandoning"
          @click="abandonOpen = true"
        />
      </div>
    </div>

    <!-- Always mounted so it keeps counting while dismissed -->
    <WorkoutRestTimerSheet v-model:open="restTimerOpen" />

    <AppSkeleton v-if="loading" :height="120" :count="3" />

    <UAlert v-else-if="error" color="error" variant="subtle" :title="error" icon="i-lucide-alert-circle" />

    <template v-else-if="workout">
      <section v-for="group in workout.groups" :key="group.id" class="space-y-2">
        <div class="flex items-center justify-between px-1">
          <span class="text-caption font-semibold uppercase text-label-secondary">
            {{ group.label || (group.type === 'SUPERSET' ? 'Superset' : 'Standard') }}
          </span>
          <AppChip v-if="group.restSeconds" icon="i-lucide-clock" :label="`Rest ${group.restSeconds}s`" />
        </div>

        <div class="space-y-4 rounded-card bg-surface p-4">
          <div v-for="exercise in group.exercises" :key="exercise.id">
            <p class="text-headline">{{ exercise.exercise.name }}</p>

            <div class="grid grid-cols-5 items-center pb-1 pt-2 text-caption2 font-semibold uppercase text-label-secondary">
              <span class="text-center">#</span>
              <span class="text-center">lb</span>
              <span class="text-center">Reps</span>
              <span class="text-center">Effort</span>
              <span class="text-center">Done</span>
            </div>

            <button
              v-for="set in exercise.sets"
              :key="set.id"
              type="button"
              class="grid w-full grid-cols-5 items-center py-2 text-subheadline tnum transition-colors hover:bg-label-secondary/10"
              :class="{ 'opacity-50': recordingSetId === set.id }"
              @click="openLog(set)"
            >
              <span
                class="text-center text-caption font-medium"
                :class="isSetCompleted(set.id) ? 'text-ios-green' : 'text-label-secondary'"
              >
                {{ set.setNumber }}
              </span>
              <span :class="isSetCompleted(set.id) ? 'text-center text-ios-green' : 'text-center text-label'">
                {{ formatValue(isSetCompleted(set.id) ? getCompletedSet(set.id)?.weight : set.weight) }}
              </span>
              <span :class="isSetCompleted(set.id) ? 'text-center text-ios-green' : 'text-center text-label'">
                {{ formatValue(isSetCompleted(set.id) ? getCompletedSet(set.id)?.reps : set.reps) }}
              </span>
              <span class="text-center text-caption text-label-tertiary">{{ set.effortTarget ?? '—' }}</span>
              <span class="flex items-center justify-center">
                <UIcon
                  :name="isSetCompleted(set.id) ? 'i-lucide-check' : 'i-lucide-circle-dashed'"
                  class="size-4"
                  :class="isSetCompleted(set.id) ? 'text-ios-green' : 'text-label-tertiary'"
                />
              </span>
            </button>
          </div>
        </div>
      </section>

      <UButton
        block
        size="xl"
        color="primary"
        icon="i-lucide-check-circle"
        label="Complete Workout"
        :loading="completing"
        @click="completeOpen = true"
      />
    </template>

    <!-- Set logging -->
    <AppSheet
      v-model:open="logOpen"
      :title="editingSet ? `Set ${editingSet.setNumber}` : 'Log set'"
      description="Enter the weight and reps you completed"
    >
      <div class="flex gap-4">
        <label class="flex-1">
          <span class="mb-1.5 block text-caption text-label-secondary">Weight (lbs)</span>
          <input
            v-model.number="editWeight"
            type="number"
            inputmode="decimal"
            step="any"
            placeholder="0"
            class="w-full rounded-chip bg-fill px-4 py-3 text-body tnum text-label outline-none focus:ring-2 focus:ring-tint"
          >
        </label>
        <label class="flex-1">
          <span class="mb-1.5 block text-caption text-label-secondary">Reps</span>
          <input
            v-model.number="editReps"
            type="number"
            inputmode="numeric"
            placeholder="0"
            class="w-full rounded-chip bg-fill px-4 py-3 text-body tnum text-label outline-none focus:ring-2 focus:ring-tint"
          >
        </label>
      </div>

      <template #footer>
        <div class="space-y-2">
          <UButton block size="lg" label="Log Set" @click="saveLog" />
          <UButton
            v-if="editingSet && isSetCompleted(editingSet.id)"
            block
            size="sm"
            color="error"
            variant="ghost"
            label="Delete Set"
            @click="removeLog"
          />
        </div>
      </template>
    </AppSheet>

    <UModal v-model:open="completeOpen" title="Complete this workout?">
      <template #body>
        <p class="text-subheadline text-label-secondary">This finalises your session.</p>
      </template>
      <template #footer>
        <div class="flex w-full gap-2">
          <UButton class="flex-1" variant="soft" label="Cancel" @click="completeOpen = false" />
          <UButton class="flex-1" :loading="completing" label="Complete" @click="confirmComplete" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="abandonOpen" title="Abandon this workout?">
      <template #body>
        <p class="text-subheadline text-label-secondary">
          All recorded sets for this session will be discarded.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full gap-2">
          <UButton class="flex-1" variant="soft" label="Cancel" @click="abandonOpen = false" />
          <UButton
            class="flex-1"
            color="error"
            :loading="abandoning"
            label="Abandon"
            @click="confirmAbandon"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
