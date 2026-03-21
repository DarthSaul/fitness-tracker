/**
 * Home dashboard page — shows weekly calendar strip, today's workout prompt, and active program status.
 */
<script setup lang="ts">
definePageMeta({ layout: 'app' })

const now = new Date()

const weekDays = computed(() => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
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
  return `Today, ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
})
</script>

<template>
  <div class="space-y-6">
    <!-- Weekly calendar strip -->
    <div class="flex justify-between">
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

    <!-- Next day in program card -->
    <UCard class="py-1">
      <div class="text-slate-400">
        Next day in program
      </div>
    </UCard>

    <!-- My Program section -->
    <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">
      My Program
    </h3>

    <UCard class="py-1">
      <div class="text-center text-slate-400">
        <p>No active programs yet.</p>
        <p class="mt-1 text-sm">
          Browse programs to get started.
        </p>
      </div>
    </UCard>

    <!-- Quick actions -->
    <div class="grid grid-cols-2 gap-4">
      <UCard class="py-5">
        <div class="text-center text-slate-400">
          Analytics
        </div>
      </UCard>
      <UCard class="py-5">
        <div class="text-center text-slate-400">
          Start a workout
        </div>
      </UCard>
    </div>
  </div>
</template>
