<script setup lang="ts">
definePageMeta({ layout: 'app' })

const route = useRoute()
const router = useRouter()

const weekNumber = computed(() => Number(route.params.week))
const dayNumber = computed(() => Number(route.params.day))

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
  loadSession,
  recordSet,
  updateSet,
  deleteCompletedSet,
  completeWorkout,
  abandonWorkout,
} = useWorkoutSession()

const { startRetroactiveSession, getSessionForDay, refreshSessions } = useProgramManager()

const pageLoading = ref(true)
const pageError = ref<string | null>(null)
const startingSession = ref(false)
const editingSetId = ref<string | null>(null)
const discardDialogOpen = ref(false)
const saveDialogOpen = ref(false)

function toLocalDateString(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const dayNum = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${dayNum}`
}

// Date picker for backdating
const todayLocal = toLocalDateString(new Date())
const workoutDate = ref(todayLocal)

onMounted(async () => {
  try {
    // Check if a session already exists for this day
    const existingSession = getSessionForDay(weekNumber.value, dayNumber.value)
    if (existingSession) {
      await loadSession(existingSession.id)
      // Pre-fill date from session
      if (session.value?.completedAt) {
        workoutDate.value = toLocalDateString(new Date(session.value.completedAt))
      } else if (session.value?.startedAt) {
        workoutDate.value = toLocalDateString(new Date(session.value.startedAt))
      }
    }
  } catch {
    pageError.value = 'Failed to load workout data'
  } finally {
    pageLoading.value = false
  }
})

async function handleStartLogging(): Promise<void> {
  pageError.value = null
  startingSession.value = true
  try {
    const sessionId = await startRetroactiveSession(weekNumber.value, dayNumber.value)
    await loadSession(sessionId)
  } catch (e) {
    const err = e as { statusCode?: number; statusMessage?: string }
    if (err.statusCode === 409) {
      pageError.value = 'A session already exists for this day'
    } else if (err.statusCode === 400 && err.statusMessage) {
      pageError.value = err.statusMessage
    } else {
      pageError.value = 'Failed to create session'
    }
  } finally {
    startingSession.value = false
  }
}

// Find the full set detail object for the currently-editing set
const editingSet = computed(() => {
  if (!editingSetId.value || !day.value) return null
  for (const group of day.value.exerciseGroups) {
    for (const ex of group.exercises) {
      const found = ex.sets.find(s => s.id === editingSetId.value)
      if (found) return found
    }
  }
  return null
})

function handleEdit(exerciseSetId: string): void {
  editingSetId.value = exerciseSetId
}

function cancelEdit(): void {
  editingSetId.value = null
}

async function handleLog(exerciseSetId: string, reps: number | null, weight: number | null): Promise<void> {
  editingSetId.value = null
  if (isSetCompleted(exerciseSetId)) {
    await updateSet(exerciseSetId, { reps, weight })
  } else {
    await recordSet(exerciseSetId, { reps, weight })
  }
}

async function onDeleteSet(): Promise<void> {
  if (!editingSetId.value) return
  const id = editingSetId.value
  try {
    await deleteCompletedSet(id)
    cancelEdit()
  } catch {
    pageError.value = 'Failed to delete set'
  }
}

async function confirmSave(): Promise<void> {
  try {
    const completedAt = new Date(workoutDate.value + 'T12:00:00').toISOString()
    await completeWorkout(completedAt)
    await refreshSessions()
    saveDialogOpen.value = false
    await router.push('/program')
  } catch {
    saveDialogOpen.value = false
    pageError.value = 'Failed to save workout'
  }
}

async function confirmDiscard(): Promise<void> {
  try {
    await abandonWorkout()
    await refreshSessions()
    discardDialogOpen.value = false
    await router.push('/program')
  } catch {
    discardDialogOpen.value = false
    pageError.value = 'Failed to discard session'
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center gap-3">
      <NuxtLink to="/program">
        <UButton
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          size="sm"
        />
      </NuxtLink>
      <h2 class="flex-1 text-lg font-semibold text-white">
        Week {{ weekNumber }}, Day {{ dayNumber }}
      </h2>
      <UButton
        v-if="session && session.status === 'IN_PROGRESS'"
        color="error"
        variant="ghost"
        size="sm"
        icon="i-lucide-trash-2"
        :loading="abandoning"
        @click="discardDialogOpen = true"
      />
    </div>

    <!-- Loading -->
    <template v-if="pageLoading">
      <div class="h-10 animate-pulse rounded-lg bg-slate-800" />
      <div class="h-4 w-full animate-pulse rounded-lg bg-slate-800" />
      <div v-for="n in 3" :key="n" class="h-32 animate-pulse rounded-lg bg-slate-800" />
    </template>

    <!-- Error -->
    <UAlert v-else-if="pageError" color="error" variant="subtle" :title="pageError" icon="i-lucide-alert-circle" />

    <!-- No session yet — show start logging prompt -->
    <template v-else-if="!session">
      <div class="flex flex-col items-center gap-4 py-8 text-center">
        <UIcon name="i-lucide-clipboard-list" class="size-12 text-slate-600" />
        <p class="text-slate-400">
          No workout logged for this day yet.
        </p>
        <UButton
          color="primary"
          size="lg"
          :loading="startingSession"
          @click="handleStartLogging"
        >
          Start Logging
        </UButton>
      </div>
    </template>

    <!-- Session exists — show editor -->
    <template v-else-if="day">
      <!-- Date picker -->
      <div class="flex items-center gap-3 rounded-lg bg-slate-800/50 px-3 py-2.5">
        <UIcon name="i-lucide-calendar" class="size-4 text-slate-400" />
        <label class="text-sm text-slate-400">Date</label>
        <input
          v-model="workoutDate"
          type="date"
          :max="todayLocal"
          class="flex-1 bg-transparent text-sm text-white outline-none"
        >
      </div>

      <!-- Completed badge -->
      <div v-if="session.status === 'COMPLETED'" class="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
        <UIcon name="i-lucide-check-circle" class="size-4" />
        Workout completed
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
          :editable="true"
          :recording-set-id="recordingSetId"
          @edit="handleEdit"
        />
      </div>

      <!-- Set log drawer -->
      <WorkoutSetLogDrawer
        v-if="editingSet"
        :open="editingSetId !== null"
        :set="editingSet"
        :completed-set="editingSetId ? (completedSets.get(editingSetId) ?? null) : null"
        :loading="recordingSetId !== null"
        :can-delete="editingSetId ? completedSets.has(editingSetId) : false"
        @log="(reps, weight) => editingSetId && handleLog(editingSetId, reps, weight)"
        @delete="onDeleteSet"
        @close="cancelEdit"
      />

      <!-- Save button (only for IN_PROGRESS sessions) -->
      <div v-if="session.status === 'IN_PROGRESS'" class="pt-4 pb-2">
        <UButton
          color="primary"
          size="lg"
          block
          class="py-5 text-base"
          :loading="completing"
          @click="saveDialogOpen = true"
        >
          Save
        </UButton>
      </div>
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
