<script setup lang="ts">
definePageMeta({ layout: 'app' })

import type { ExerciseSetDetail } from '~/types/program'

const route = useRoute()
const router = useRouter()
const sessionId = computed(() => route.params.id as string)

const {
  session,
  day,
  completedSets,
  completing,
  recordingSetId,
  totalSets,
  completedSetCount,
  progressPercent,
  isSetCompleted,
  getCompletedSet,
  loadActiveSession,
  recordSet,
  completeWorkout,
} = useWorkoutSession()

const pageLoading = ref(true)
const pageError = ref<string | null>(null)
const programCompleted = ref(false)

// Expand/collapse state for exercise groups
const expandedGroups = ref(new Set<string>())

function toggleGroup(groupId: string): void {
  if (expandedGroups.value.has(groupId)) {
    expandedGroups.value.delete(groupId)
  } else {
    expandedGroups.value.add(groupId)
  }
}

// Inline edit state
const editingSetId = ref<string | null>(null)
const editReps = ref<number | null>(null)
const editWeight = ref<number | null>(null)

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

function openEdit(set: ExerciseSetDetail): void {
  if (isSetCompleted(set.id)) return
  editingSetId.value = set.id
  editReps.value = set.reps
  editWeight.value = set.weight
}

function cancelEdit(): void {
  editingSetId.value = null
}

async function logSet(set: ExerciseSetDetail): Promise<void> {
  const reps = editingSetId.value === set.id ? editReps.value : set.reps
  const weight = editingSetId.value === set.id ? editWeight.value : set.weight

  editingSetId.value = null
  await recordSet(set.id, { reps, weight })
}

async function finishWorkout(): Promise<void> {
  if (!confirm('Complete this workout?')) return
  try {
    const result = await completeWorkout()
    if (result.programCompleted) {
      programCompleted.value = true
    } else {
      await router.push('/app')
    }
  } catch {
    // Error is handled by completing state resetting
  }
}

function formatWeight(w: number | null | undefined): string {
  if (w == null) return '—'
  return `${w} lbs`
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
        <template v-for="group in day.exerciseGroups" :key="group.id">
          <!-- Superset wrapper -->
          <div
            v-if="group.type === 'SUPERSET'"
            class="relative rounded-xl border border-indigo-500/25 p-1.5 pt-2"
          >
            <span class="absolute -left-2 -top-2 flex size-5 items-center justify-center rounded-full border border-indigo-500/40 bg-slate-950 text-[8px] font-semibold text-indigo-300">SS</span>
            <div class="space-y-1.5">
              <div
                v-for="(ex, exIdx) in group.exercises"
                :key="ex.id"
                class="rounded-lg bg-slate-800/50"
              >
                <!-- Exercise card header -->
                <button
                  class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left"
                  @click="toggleGroup(ex.id)"
                >
                  <div class="min-w-0 flex-1">
                    <p class="font-medium text-white">{{ ex.exercise.name }}</p>
                    <span v-if="exIdx === group.exercises.length - 1" class="mt-1 block text-xs text-slate-500">
                      Rest: {{ group.restSeconds ?? 120 }}s
                    </span>
                  </div>
                  <UIcon
                    :name="expandedGroups.has(ex.id) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                    class="size-6 shrink-0 text-slate-400"
                  />
                </button>

                <!-- Expanded sets -->
                <div
                  class="grid overflow-hidden transition-all duration-200 ease-in-out"
                  :class="expandedGroups.has(ex.id) ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
                >
                  <div class="min-h-0">
                    <div class="border-t border-slate-700/50 px-3 pb-3 pt-2">
                      <div class="space-y-1.5">
                        <div v-for="set in ex.sets" :key="set.id">
                          <!-- Completed set -->
                          <div
                            v-if="isSetCompleted(set.id)"
                            class="flex items-center gap-3 rounded-md bg-emerald-500/10 px-3 py-2 text-sm"
                          >
                            <span class="w-10 shrink-0 text-xs font-medium text-slate-400">Set {{ set.setNumber }}</span>
                            <span class="text-emerald-300">{{ formatWeight(getCompletedSet(set.id)?.weight) }}</span>
                            <span class="text-emerald-300">{{ getCompletedSet(set.id)?.reps ?? '—' }} reps</span>

                            <UIcon name="i-lucide-check" class="ml-auto size-4 text-emerald-400" />
                          </div>

                          <!-- Editing set -->
                          <div v-else-if="editingSetId === set.id" class="rounded-md bg-slate-700/50 px-3 py-2">
                            <div class="mb-2 flex items-center justify-between">
                              <span class="text-xs font-medium text-slate-400">Set {{ set.setNumber }}</span>
                              <button class="text-slate-500 hover:text-slate-300" @click="cancelEdit">
                                <UIcon name="i-lucide-x" class="size-4" />
                              </button>
                            </div>
                            <div class="flex items-end gap-2">
                              <div class="flex-1">
                                <label class="mb-0.5 block text-xs text-slate-500">Weight</label>
                                <input v-model.number="editWeight" type="number" inputmode="decimal" step="any" class="w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-white outline-none ring-1 ring-slate-600 focus:ring-violet-500" placeholder="lbs">
                              </div>
                              <div class="flex-1">
                                <label class="mb-0.5 block text-xs text-slate-500">Reps</label>
                                <input v-model.number="editReps" type="number" inputmode="numeric" class="w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-white outline-none ring-1 ring-slate-600 focus:ring-violet-500" placeholder="reps">
                              </div>
                            </div>
                            <div class="mt-2">
                              <UButton color="primary" size="xs" block class="rounded-sm" :loading="recordingSetId === set.id" @click="logSet(set)">Log</UButton>
                            </div>
                          </div>

                          <!-- Pending set -->
                          <button
                            v-else
                            class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-slate-700/50 active:bg-slate-700"
                            :disabled="recordingSetId === set.id"
                            @click="openEdit(set)"
                          >
                            <span class="w-10 shrink-0 text-xs font-medium text-slate-500">Set {{ set.setNumber }}</span>
                            <span class="text-slate-300">{{ formatWeight(set.weight) }}</span>
                            <span class="text-slate-300">{{ set.reps ?? '—' }} reps</span>

                            <span v-if="set.notes" class="ml-auto text-xs text-slate-600" :title="set.notes">*</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Standard (single exercise) card -->
          <div
            v-else
            class="rounded-lg bg-slate-800/50"
          >
            <button
              class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left"
              @click="toggleGroup(group.id)"
            >
              <div class="min-w-0 flex-1">
                <p class="font-medium text-white">{{ group.exercises[0]?.exercise.name }}</p>
                <span class="mt-1 block text-xs text-slate-500">
                  Rest: {{ group.restSeconds ?? 120 }}s
                </span>
              </div>
              <UIcon
                :name="expandedGroups.has(group.id) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                class="size-6 shrink-0 text-slate-400"
              />
            </button>

            <!-- Expanded sets -->
            <div
              class="grid overflow-hidden transition-all duration-200 ease-in-out"
              :class="expandedGroups.has(group.id) ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
            >
              <div class="min-h-0">
                <div class="border-t border-slate-700/50 px-3 pb-3 pt-2">
                  <div class="space-y-1.5">
                    <div v-for="set in group.exercises[0]?.sets" :key="set.id">
                      <!-- Completed set -->
                      <div
                        v-if="isSetCompleted(set.id)"
                        class="flex items-center gap-3 rounded-md bg-emerald-500/10 px-3 py-2 text-sm"
                      >
                        <span class="w-10 shrink-0 text-xs font-medium text-slate-400">Set {{ set.setNumber }}</span>
                        <span class="text-emerald-300">{{ formatWeight(getCompletedSet(set.id)?.weight) }}</span>
                        <span class="text-emerald-300">{{ getCompletedSet(set.id)?.reps ?? '—' }} reps</span>

                        <UIcon name="i-lucide-check" class="ml-auto size-4 text-emerald-400" />
                      </div>

                      <!-- Editing set -->
                      <div v-else-if="editingSetId === set.id" class="rounded-md bg-slate-700/50 px-3 py-2">
                        <div class="mb-2 flex items-center justify-between">
                          <span class="text-xs font-medium text-slate-400">Set {{ set.setNumber }}</span>
                          <button class="text-slate-500 hover:text-slate-300" @click="cancelEdit">
                            <UIcon name="i-lucide-x" class="size-4" />
                          </button>
                        </div>
                        <div class="flex items-end gap-2">
                          <div class="flex-1">
                            <label class="mb-0.5 block text-xs text-slate-500">Weight</label>
                            <input v-model.number="editWeight" type="number" inputmode="decimal" step="any" class="w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-white outline-none ring-1 ring-slate-600 focus:ring-violet-500" placeholder="lbs">
                          </div>
                          <div class="flex-1">
                            <label class="mb-0.5 block text-xs text-slate-500">Reps</label>
                            <input v-model.number="editReps" type="number" inputmode="numeric" class="w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-white outline-none ring-1 ring-slate-600 focus:ring-violet-500" placeholder="reps">
                          </div>
                        </div>
                        <div class="mt-2">
                          <UButton color="primary" size="xs" block class="rounded-sm" :loading="recordingSetId === set.id" @click="logSet(set)">Log</UButton>
                        </div>
                      </div>

                      <!-- Pending set -->
                      <button
                        v-else
                        class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-slate-700/50 active:bg-slate-700"
                        :disabled="recordingSetId === set.id"
                        @click="openEdit(set)"
                      >
                        <span class="w-10 shrink-0 text-xs font-medium text-slate-500">Set {{ set.setNumber }}</span>
                        <span class="text-slate-300">{{ formatWeight(set.weight) }}</span>
                        <span class="text-slate-300">{{ set.reps ?? '—' }} reps</span>

                        <span v-if="set.notes" class="ml-auto text-xs text-slate-600" :title="set.notes">*</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Complete workout button (sticky bottom) -->
      <div class="sticky bottom-20 pt-4">
        <UButton
          color="primary"
          size="lg"
          block
          :loading="completing"
          @click="finishWorkout"
        >
          Complete Workout
        </UButton>
      </div>
    </template>
  </div>
</template>
