<script setup lang="ts">
definePageMeta({ layout: 'app' })

const router = useRouter()

const {
  activeProgram,
  isLoading,
  getSessionForDay,
  isDayCompleted,
  isDayInProgress,
  getTotalSetsForDay,
} = useProgramManager()

const expandedWeeks = ref(new Set<number>())

function toggleWeek(weekNumber: number): void {
  if (expandedWeeks.value.has(weekNumber)) {
    expandedWeeks.value.delete(weekNumber)
  } else {
    expandedWeeks.value.add(weekNumber)
  }
}

// Auto-expand the current week
watch(() => activeProgram.value, (program) => {
  if (program) {
    expandedWeeks.value.add(program.currentWeek)
  }
}, { immediate: true })

function dayStatus(weekNumber: number, dayNumber: number): 'completed' | 'in-progress' | 'current' | 'upcoming' {
  if (isDayCompleted(weekNumber, dayNumber)) return 'completed'
  if (isDayInProgress(weekNumber, dayNumber)) return 'in-progress'
  if (
    activeProgram.value &&
    weekNumber === activeProgram.value.currentWeek &&
    dayNumber === activeProgram.value.currentDay
  ) return 'current'
  return 'upcoming'
}

/** Only lock the day if it's an active workout at the current program position (started from home). */
function isActiveWorkoutDay(weekNumber: number, dayNumber: number): boolean {
  if (!activeProgram.value) return false
  return (
    isDayInProgress(weekNumber, dayNumber) &&
    weekNumber === activeProgram.value.currentWeek &&
    dayNumber === activeProgram.value.currentDay
  )
}

function navigateToDay(weekNumber: number, dayNumber: number): void {
  if (isActiveWorkoutDay(weekNumber, dayNumber)) return
  router.push(`/program/week/${weekNumber}/day/${dayNumber}`)
}
</script>

<template>
  <div class="space-y-4">
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
        Manage Program
      </h2>
    </div>

    <!-- Loading skeleton -->
    <template v-if="isLoading">
      <div class="h-6 w-40 animate-pulse rounded bg-slate-800" />
      <div v-for="i in 3" :key="i" class="space-y-2">
        <div class="h-12 animate-pulse rounded-lg bg-slate-800" />
      </div>
    </template>

    <!-- No active program -->
    <UCard v-else-if="!activeProgram" class="py-1">
      <div class="text-center text-slate-400">
        <p>No active program.</p>
        <NuxtLink to="/programs" class="mt-1 inline-block text-sm text-violet-400 hover:text-violet-300">
          Browse programs to get started.
        </NuxtLink>
      </div>
    </UCard>

    <!-- Program overview -->
    <template v-else>
      <p class="text-sm text-slate-400">
        {{ activeProgram.program.name }}
      </p>

      <!-- Weeks -->
      <div class="space-y-3">
        <div v-for="week in activeProgram.program.weeks" :key="week.id">
          <!-- Week header -->
          <button
            class="flex w-full items-center justify-between rounded-lg bg-slate-800/50 px-4 py-3"
            @click="toggleWeek(week.weekNumber)"
          >
            <div class="flex items-center gap-2">
              <span class="font-medium text-white">Week {{ week.weekNumber }}</span>
              <span class="text-xs text-slate-500">{{ week.days.length }} days</span>
            </div>
            <UIcon
              :name="expandedWeeks.has(week.weekNumber) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              class="size-5 text-slate-400"
            />
          </button>

          <!-- Days -->
          <div
            class="grid overflow-hidden transition-all duration-200 ease-in-out"
            :class="expandedWeeks.has(week.weekNumber) ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
          >
            <div class="min-h-0">
              <div class="space-y-1.5 pt-1.5">
                <button
                  v-for="dayItem in week.days"
                  :key="dayItem.id"
                  class="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors"
                  :class="isActiveWorkoutDay(week.weekNumber, dayItem.dayNumber)
                    ? 'bg-slate-800/20 opacity-50 cursor-not-allowed'
                    : 'bg-slate-800/30 hover:bg-slate-800/60 active:bg-slate-700/50'"
                  :disabled="isActiveWorkoutDay(week.weekNumber, dayItem.dayNumber)"
                  @click="navigateToDay(week.weekNumber, dayItem.dayNumber)"
                >
                  <!-- Status indicator -->
                  <div
                    class="flex size-6 shrink-0 items-center justify-center rounded-full"
                    :class="{
                      'bg-emerald-500/20': dayStatus(week.weekNumber, dayItem.dayNumber) === 'completed',
                      'bg-amber-500/20': dayStatus(week.weekNumber, dayItem.dayNumber) === 'in-progress',
                      'bg-violet-500/20': dayStatus(week.weekNumber, dayItem.dayNumber) === 'current',
                      'bg-slate-700': dayStatus(week.weekNumber, dayItem.dayNumber) === 'upcoming',
                    }"
                  >
                    <UIcon
                      v-if="dayStatus(week.weekNumber, dayItem.dayNumber) === 'completed'"
                      name="i-lucide-check"
                      class="size-3.5 text-emerald-400"
                    />
                    <div
                      v-else-if="dayStatus(week.weekNumber, dayItem.dayNumber) === 'in-progress'"
                      class="size-2 rounded-full bg-amber-400"
                    />
                    <div
                      v-else-if="dayStatus(week.weekNumber, dayItem.dayNumber) === 'current'"
                      class="size-2 rounded-full bg-violet-400"
                    />
                    <div
                      v-else
                      class="size-2 rounded-full bg-slate-500"
                    />
                  </div>

                  <!-- Day info -->
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-white">
                      Day {{ dayItem.dayNumber }}
                      <span v-if="dayItem.name" class="text-slate-400"> — {{ dayItem.name }}</span>
                    </p>
                    <p
                      v-if="isActiveWorkoutDay(week.weekNumber, dayItem.dayNumber)"
                      class="text-xs text-amber-400"
                    >
                      Workout in progress — complete or discard it first
                    </p>
                    <p
                      v-else-if="getSessionForDay(week.weekNumber, dayItem.dayNumber)"
                      class="text-xs text-slate-500"
                    >
                      {{ getSessionForDay(week.weekNumber, dayItem.dayNumber)?._count.completedSets }} / {{ getTotalSetsForDay(week.weekNumber, dayItem.dayNumber) }} sets
                    </p>
                  </div>

                  <UIcon
                    v-if="!isActiveWorkoutDay(week.weekNumber, dayItem.dayNumber)"
                    name="i-lucide-chevron-right"
                    class="size-4 shrink-0 text-slate-600"
                  />
                  <UIcon
                    v-else
                    name="i-lucide-lock"
                    class="size-4 shrink-0 text-amber-500/50"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
