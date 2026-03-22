<script setup lang="ts">
definePageMeta({ layout: 'app' })

const route = useRoute()
const router = useRouter()
const sessionId = computed(() => route.params.id as string)

const {
  session,
  day,
  completedSets,
  completing,
  abandoning,
  recordingSetId,
  totalSets,
  completedSetCount,
  progressPercent,
  isSetCompleted,
  loadActiveSession,
  recordSet,
  completeWorkout,
  abandonWorkout,
} = useWorkoutSession()

const pageLoading = ref(true)
const pageError = ref<string | null>(null)
const programCompleted = ref(false)
const endDialogOpen = ref(false)
const completeDialogOpen = ref(false)

// Inline edit state
const editingSetId = ref<string | null>(null)

onMounted(async () => {
  try {
    const found = await loadActiveSession()
    if (!found || session.value?.id !== sessionId.value) {
      await router.replace('/app')
      return
    }
  } catch {
    pageError.value = 'Failed to load workout session'
  } finally {
    pageLoading.value = false
  }
})

function handleEdit(exerciseSetId: string): void {
  if (isSetCompleted(exerciseSetId)) return
  editingSetId.value = exerciseSetId
}

function cancelEdit(): void {
  editingSetId.value = null
}

async function handleLog(exerciseSetId: string, reps: number | null, weight: number | null): Promise<void> {
  editingSetId.value = null
  await recordSet(exerciseSetId, { reps, weight })
}

async function confirmComplete(): Promise<void> {
  try {
    const result = await completeWorkout()
    completeDialogOpen.value = false
    if (result.programCompleted) {
      programCompleted.value = true
    } else {
      await router.push('/app')
    }
  } catch {
    // Error is handled by completing state resetting
  }
}

async function handlePause(): Promise<void> {
  endDialogOpen.value = false
  await router.push('/app')
}

async function handleDiscard(): Promise<void> {
  try {
    await abandonWorkout()
    endDialogOpen.value = false
    await router.push('/app')
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
      <UButton color="primary" size="lg" @click="router.push('/app')">
        Back to Home
      </UButton>
    </div>

    <!-- Workout session -->
    <template v-else-if="session && day">
      <!-- Header -->
      <div class="flex items-center gap-3">
        <NuxtLink to="/app">
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
      <div v-if="day.warmUp" class="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
        Warm-up: {{ day.warmUp }}
      </div>

      <!-- Exercise groups -->
      <div class="space-y-3">
        <WorkoutExerciseCard
          v-for="group in day.exerciseGroups"
          :key="group.id"
          :group="group"
          :completed-sets="completedSets"
          :editable="false"
          :editing-set-id="editingSetId"
          :recording-set-id="recordingSetId"
          @log="handleLog"
          @edit="handleEdit"
          @cancel-edit="cancelEdit"
        />
      </div>

      <!-- Action buttons (sticky bottom) -->
      <div class="sticky bottom-20 flex gap-3 pt-4">
        <UButton
          color="neutral"
          variant="outline"
          size="lg"
          class="flex-1"
          @click="endDialogOpen = true"
        >
          End Workout
        </UButton>
        <UButton
          color="primary"
          size="lg"
          class="flex-1"
          :loading="completing"
          @click="completeDialogOpen = true"
        >
          Complete Workout
        </UButton>
      </div>
    </template>

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
