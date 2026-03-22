/**
 * Home dashboard page — shows weekly calendar strip, today's workout prompt, and active program status.
 */
<script setup lang="ts">
definePageMeta({ layout: 'app' })

import type { ActiveWorkoutResponse } from '~/types/workout'

const router = useRouter()

const nowRef = ref<Date | null>(null)

onMounted(() => {
  nowRef.value = new Date()
})

const { data: activeProgram, status: activeProgramStatus, error: activeProgramError } = useFetch<{
  id: string
  programId: string
  currentWeek: number
  currentDay: number
  program: {
    id: string
    name: string
    description: string | null
    weeks: { days: { id: string }[] }[]
  }
}>('/api/user-programs/active')

const { data: sessionsData } = useFetch<{
  sessions: { status: 'IN_PROGRESS' | 'COMPLETED' }[]
}>('/api/user-programs/active/sessions', {
  watch: [activeProgram],
})

const programTotalDays = computed(() => {
  if (!activeProgram.value) return 0
  return activeProgram.value.program.weeks.reduce((sum, w) => sum + w.days.length, 0)
})

const programCompletedDays = computed(() => {
  if (!sessionsData.value) return 0
  return sessionsData.value.sessions.filter(s => s.status === 'COMPLETED').length
})

const programProgressPercent = computed(() => {
  if (programTotalDays.value === 0) return 0
  return Math.round((programCompletedDays.value / programTotalDays.value) * 100)
})

const isActiveProgramFetchError = computed(() => {
  return activeProgramError.value && activeProgramError.value.statusCode !== 404
})

const formattedToday = computed(() => {
  if (!nowRef.value) return ''
  return `Today, ${nowRef.value.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
})

// Active workout session
const { data: activeWorkout, status: activeWorkoutStatus } = useFetch<ActiveWorkoutResponse>('/api/workouts/active')

const { startWorkout, loading: startingWorkout, error: workoutError } = useWorkoutSession()

async function handleStartWorkout(): Promise<void> {
  try {
    const sessionId = await startWorkout()
    await router.push(`/workout/${sessionId}`)
  } catch {
    // Error is set in composable
  }
}

function resumeWorkout(): void {
  if (activeWorkout.value?.session) {
    router.push(`/workout/${activeWorkout.value.session.id}`)
  }
}

const activeWorkoutTotalSets = computed(() => {
  if (!activeWorkout.value?.day) return 0
  return activeWorkout.value.day.exerciseGroups.reduce(
    (sum, g) => sum + g.exercises.reduce((s, e) => s + e.sets.length, 0), 0
  )
})

const activeWorkoutCompletedSets = computed(() => {
  return activeWorkout.value?.session?.completedSets?.length ?? 0
})

const activeWorkoutProgress = computed(() => {
  if (activeWorkoutTotalSets.value === 0) return 0
  const percent = Math.round((activeWorkoutCompletedSets.value / activeWorkoutTotalSets.value) * 100)
  return Math.max(0, Math.min(100, percent))
})
</script>

<template>
  <div class="space-y-6">
    <!-- Weekly calendar strip -->
    <CalendarStrip :loading="!nowRef" />

    <!-- Today header -->
    <h2 class="text-lg font-semibold text-white">
      {{ formattedToday }}
    </h2>

    <!-- Workout card skeleton -->
    <div v-if="activeWorkoutStatus === 'pending'" class="h-24 animate-pulse rounded-lg bg-slate-800" />

    <!-- Resume workout with progress bar -->
    <UCard
      v-else-if="activeWorkout?.session"
      v-wave
      class="overflow-hidden border border-violet-500/30 py-1 cursor-pointer"
      tabindex="0"
      role="button"
      :aria-label="`Resume workout: Week ${activeWorkout.session.weekNumber}, Day ${activeWorkout.session.dayNumber}`"
      @click="resumeWorkout"
      @keydown.enter="resumeWorkout"
      @keydown.space.prevent="resumeWorkout"
    >
      <div class="flex items-center justify-between">
        <p class="font-medium text-white">
          Week {{ activeWorkout.session.weekNumber }}, Day {{ activeWorkout.session.dayNumber }}
        </p>
        <span class="flex items-center gap-1 rounded-full bg-violet-600/20 px-2.5 py-0.5 text-xs font-medium text-violet-400">
          Resume
          <UIcon name="i-lucide-chevron-right" class="size-3.5" />
        </span>
      </div>
      <div class="mt-3 space-y-1">
        <div class="h-3 overflow-hidden rounded-full bg-slate-800">
          <div
            class="h-full rounded-full bg-violet-600 transition-all duration-300"
            :style="{ width: `${activeWorkoutProgress}%` }"
          />
        </div>
        <p class="text-xs text-slate-400">
          {{ activeWorkoutCompletedSets }} / {{ activeWorkoutTotalSets }} sets
        </p>
      </div>
    </UCard>

    <!-- Next day / Start workout card -->
    <UCard
      v-else-if="activeProgram"
      v-wave
      class="overflow-hidden py-1 cursor-pointer"
      tabindex="0"
      role="button"
      :aria-label="`Start workout: Week ${activeProgram.currentWeek}, Day ${activeProgram.currentDay}`"
      @click="handleStartWorkout"
      @keydown.enter="handleStartWorkout"
      @keydown.space.prevent="handleStartWorkout"
    >
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-slate-400">Next up</p>
          <p class="font-semibold text-white">
            Week {{ activeProgram.currentWeek }}, Day {{ activeProgram.currentDay }}
          </p>
        </div>
        <span class="flex items-center gap-1 rounded-full bg-violet-600/20 px-2.5 py-0.5 text-xs font-medium text-violet-400">
          Start
          <UIcon name="i-lucide-chevron-right" class="size-3.5" />
        </span>
      </div>
      <UAlert
        v-if="workoutError"
        color="error"
        variant="subtle"
        :title="workoutError"
        class="mt-3"
      />
    </UCard>

    <!-- No active program placeholder -->
    <UCard v-else-if="activeProgramStatus !== 'pending'" class="py-1">
      <div class="text-slate-400">
        Next day in program
      </div>
    </UCard>

    <!-- Loading -->
    <div v-if="activeProgramStatus === 'pending'" class="grid grid-cols-[1fr_3fr] gap-3">
      <div class="h-28 animate-pulse rounded-lg bg-slate-800" />
      <div class="h-28 animate-pulse rounded-lg bg-slate-800" />
    </div>

    <!-- Fetch error (non-404) -->
    <UCard v-else-if="isActiveProgramFetchError" class="py-1">
      <div class="text-center text-red-400">
        <p>Failed to load program.</p>
        <p class="mt-1 text-sm">
          Please try again later.
        </p>
      </div>
    </UCard>

    <!-- Active program -->
    <div v-else-if="activeProgram" class="grid grid-cols-[1fr_3fr] gap-3">
      <!-- Circular progress card -->
      <UCard class="py-0">
        <div class="flex flex-col items-center justify-center -my-1">
          <svg class="size-16" viewBox="0 0 64 64">
            <!-- Background circle -->
            <circle
              cx="32" cy="32" r="28"
              fill="none"
              stroke="currentColor"
              stroke-width="5"
              class="text-slate-700"
            />
            <!-- Progress arc -->
            <circle
              cx="32" cy="32" r="28"
              fill="none"
              stroke="currentColor"
              stroke-width="5"
              stroke-linecap="round"
              class="text-violet-500 transition-all duration-500"
              :stroke-dasharray="`${programProgressPercent * 1.7593} 175.93`"
              transform="rotate(-90 32 32)"
            />
            <text
              x="32" y="34"
              text-anchor="middle"
              dominant-baseline="middle"
              fill="white"
              font-size="13"
              font-weight="600"
            >
              {{ programCompletedDays }}/{{ programTotalDays }}
            </text>
          </svg>
        </div>
      </UCard>

      <!-- Program info card -->
      <UCard v-wave class="overflow-hidden py-1 cursor-pointer">
        <NuxtLink to="/program" class="flex h-full items-center justify-between">
          <div>
            <h4 class="font-semibold text-white">
              {{ activeProgram.program.name }}
            </h4>
            <p class="mt-1 text-sm text-slate-400">
              Week {{ activeProgram.currentWeek }} · Day {{ activeProgram.currentDay }}
            </p>
          </div>
          <UIcon name="i-lucide-chevron-right" class="size-5 text-slate-500" />
        </NuxtLink>
      </UCard>
    </div>

    <!-- No active program -->
    <UCard v-else class="py-1">
      <div class="text-center text-slate-400">
        <p>No active programs yet.</p>
        <NuxtLink to="/programs" class="mt-1 inline-block text-sm text-violet-400 hover:text-violet-300">
          Browse programs to get started.
        </NuxtLink>
      </div>
    </UCard>

    <!-- My Fitness section -->
    <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">
      My Fitness
    </h3>

    <!-- Quick actions -->
    <div class="grid grid-cols-2 gap-4">
      <NuxtLink to="/analytics">
        <UCard v-wave class="overflow-hidden py-5">
          <div class="text-center text-slate-400">
            Analytics
          </div>
        </UCard>
      </NuxtLink>
      <NuxtLink to="/programs">
        <UCard v-wave class="overflow-hidden py-5">
          <div class="text-center text-slate-400">
            Browse Programs
          </div>
        </UCard>
      </NuxtLink>
    </div>
  </div>
</template>
