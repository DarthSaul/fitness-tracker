<script setup lang="ts">
definePageMeta({ layout: 'app', header: { title: 'Manage Program', style: 'inline' } })

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
    <!-- Loading skeleton -->
    <template v-if="isLoading">
      <AppSkeleton :height="24" :width="160" />
      <div v-for="i in 3" :key="i" class="space-y-2">
        <AppSkeleton :height="48" />
      </div>
    </template>

    <!-- No active program -->
    <UCard v-else-if="!activeProgram" class="py-1">
      <div class="text-center text-label-secondary">
        <p>No active program.</p>
        <NuxtLink to="/programs" class="mt-1 inline-block text-sm text-tint hover:text-tint">
          Browse programs to get started.
        </NuxtLink>
      </div>
    </UCard>

    <!-- Program overview -->
    <template v-else>
      <p class="text-sm text-label-secondary">
        {{ activeProgram.program.name }}
      </p>

      <!-- Weeks -->
      <div class="space-y-3">
        <div v-for="week in activeProgram.program.weeks" :key="week.id">
          <!-- Week header -->
          <button
            v-wave
            class="flex w-full items-center justify-between rounded-tile bg-surface px-4 py-3 overflow-hidden"
            @click="toggleWeek(week.weekNumber)"
          >
            <div class="flex items-center gap-2">
              <span class="font-medium text-label">Week {{ week.weekNumber }}</span>
              <span class="text-xs text-label-secondary">{{ week.days.length }} days</span>
            </div>
            <UIcon
              :name="expandedWeeks.has(week.weekNumber) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              class="size-5 text-label-secondary"
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
                  v-wave
                  class="flex w-full items-center gap-3 rounded-tile px-4 py-3 text-left overflow-hidden transition-colors"
                  :class="isActiveWorkoutDay(week.weekNumber, dayItem.dayNumber)
                    ? 'bg-surface opacity-50 cursor-not-allowed'
                    : 'bg-surface hover:bg-label-secondary/10 active:bg-label-secondary/20'"
                  :disabled="isActiveWorkoutDay(week.weekNumber, dayItem.dayNumber)"
                  @click="navigateToDay(week.weekNumber, dayItem.dayNumber)"
                >
                  <!-- Status indicator -->
                  <div
                    class="flex size-6 shrink-0 items-center justify-center rounded-full"
                    :class="{
                      'bg-ios-green/20': dayStatus(week.weekNumber, dayItem.dayNumber) === 'completed',
                      'bg-ios-orange/20': dayStatus(week.weekNumber, dayItem.dayNumber) === 'in-progress',
                      'bg-tint/20': dayStatus(week.weekNumber, dayItem.dayNumber) === 'current',
                      'bg-label-secondary/15': dayStatus(week.weekNumber, dayItem.dayNumber) === 'upcoming',
                    }"
                  >
                    <UIcon
                      v-if="dayStatus(week.weekNumber, dayItem.dayNumber) === 'completed'"
                      name="i-lucide-check"
                      class="size-3.5 text-ios-green"
                    />
                    <div
                      v-else-if="dayStatus(week.weekNumber, dayItem.dayNumber) === 'in-progress'"
                      class="size-2 rounded-full bg-ios-orange"
                    />
                    <div
                      v-else-if="dayStatus(week.weekNumber, dayItem.dayNumber) === 'current'"
                      class="size-2 rounded-full bg-tint"
                    />
                    <div
                      v-else
                      class="size-2 rounded-full bg-label-secondary"
                    />
                  </div>

                  <!-- Day info -->
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-label">
                      Day {{ dayItem.dayNumber }}
                      <span v-if="dayItem.name" class="text-label-secondary"> — {{ dayItem.name }}</span>
                    </p>
                    <p
                      v-if="isActiveWorkoutDay(week.weekNumber, dayItem.dayNumber)"
                      class="text-xs text-ios-orange"
                    >
                      Workout in progress — complete or discard it first
                    </p>
                    <p
                      v-else-if="getSessionForDay(week.weekNumber, dayItem.dayNumber)"
                      class="text-xs text-label-secondary"
                    >
                      {{ getSessionForDay(week.weekNumber, dayItem.dayNumber)?._count.completedSets }} / {{ getTotalSetsForDay(week.weekNumber, dayItem.dayNumber) }} sets
                    </p>
                  </div>

                  <UIcon
                    v-if="!isActiveWorkoutDay(week.weekNumber, dayItem.dayNumber)"
                    name="i-lucide-chevron-right"
                    class="size-4 shrink-0 text-label-tertiary"
                  />
                  <UIcon
                    v-else
                    name="i-lucide-lock"
                    class="size-4 shrink-0 text-ios-orange/50"
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
