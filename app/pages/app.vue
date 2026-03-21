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
  program: { id: string; name: string; description: string | null }
}>('/api/user-programs/active')

const isActiveProgramFetchError = computed(() => {
  return activeProgramError.value && activeProgramError.value.statusCode !== 404
})

const weekDays = computed(() => {
  if (!nowRef.value) return []
  const today = new Date(nowRef.value.getFullYear(), nowRef.value.getMonth(), nowRef.value.getDate())
  const dayOfWeek = today.getDay()
  // Monday-start: shift Sunday (0) to 6, others subtract 1
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(today)
  monday.setDate(today.getDate() - mondayOffset)

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    return {
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNumber: date.getDate(),
      isToday:
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate(),
    }
  })
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
</script>

<template>
  <div class="space-y-6">
    <!-- Weekly calendar strip -->
    <div v-if="weekDays.length === 0" class="flex justify-between">
      <div
        v-for="i in 7"
        :key="i"
        class="flex flex-col items-center gap-1"
      >
        <div class="h-4 w-8 animate-pulse rounded bg-slate-800" />
        <div class="h-10 w-10 animate-pulse rounded-lg bg-slate-800" />
      </div>
    </div>
    <div v-else class="flex justify-between">
      <div
        v-for="day in weekDays"
        :key="day.dayNumber"
        class="flex flex-col items-center gap-1"
      >
        <span
          class="text-xs"
          :class="day.isToday ? 'text-white font-semibold' : 'text-slate-400'"
        >
          {{ day.dayName }}
        </span>
        <div
          class="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium"
          :class="
            day.isToday
              ? 'bg-violet-600 text-white'
              : 'bg-slate-800 text-slate-400'
          "
        >
          {{ day.dayNumber }}
        </div>
      </div>
    </div>

    <!-- Today header -->
    <h2 class="text-lg font-semibold text-white">
      {{ formattedToday }}
    </h2>

    <!-- Workout card skeleton -->
    <div v-if="activeWorkoutStatus === 'pending'" class="h-16 animate-pulse rounded-lg bg-slate-800" />

    <!-- Resume workout banner -->
    <UCard v-else-if="activeWorkout?.session" class="border border-violet-500/30 py-1">
      <div class="flex items-center justify-between">
        <div>
          <p class="font-medium text-white">
            Workout in progress
          </p>
          <p class="text-sm text-slate-400">
            Week {{ activeWorkout.session.weekNumber }}, Day {{ activeWorkout.session.dayNumber }}
          </p>
        </div>
        <UButton color="primary" @click="resumeWorkout">
          Resume
        </UButton>
      </div>
    </UCard>

    <!-- Next day / Start workout card -->
    <UCard v-else-if="activeProgram" class="py-1">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-slate-400">Next up</p>
          <p class="font-semibold text-white">
            Week {{ activeProgram.currentWeek }}, Day {{ activeProgram.currentDay }}
          </p>
        </div>
        <UButton
          color="primary"
          :loading="startingWorkout"
          @click="handleStartWorkout"
        >
          Start Workout
        </UButton>
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

    <!-- My Program section -->
    <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">
      My Program
    </h3>

    <!-- Loading -->
    <div v-if="activeProgramStatus === 'pending'" class="h-20 animate-pulse rounded-lg bg-slate-800" />

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
    <UCard v-else-if="activeProgram" class="py-1">
      <NuxtLink :to="`/programs/${activeProgram.programId}`" class="flex items-center justify-between">
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

    <!-- No active program -->
    <UCard v-else class="py-1">
      <div class="text-center text-slate-400">
        <p>No active programs yet.</p>
        <NuxtLink to="/programs" class="mt-1 inline-block text-sm text-violet-400 hover:text-violet-300">
          Browse programs to get started.
        </NuxtLink>
      </div>
    </UCard>

    <!-- Quick actions -->
    <div class="grid grid-cols-2 gap-4">
      <NuxtLink to="/analytics">
        <UCard class="py-5">
          <div class="text-center text-slate-400">
            Analytics
          </div>
        </UCard>
      </NuxtLink>
      <NuxtLink to="/programs">
        <UCard class="py-5">
          <div class="text-center text-slate-400">
            Browse Programs
          </div>
        </UCard>
      </NuxtLink>
    </div>
  </div>
</template>
