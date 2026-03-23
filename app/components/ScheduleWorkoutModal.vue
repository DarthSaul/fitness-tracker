/**
 * Modal for scheduling a workout on a specific date.
 * Shows all program days grouped by week — user taps one to schedule it.
 */
<script setup lang="ts">
const props = defineProps<{
  open: boolean
  targetDate: Date
  program: {
    weeks: Array<{
      id: string
      weekNumber: number
      days: Array<{
        id: string
        dayNumber: number
        name: string | null
      }>
    }>
  }
  scheduledWorkouts: Array<{
    id: string
    weekNumber: number
    dayNumber: number
    scheduledDate: string
  }>
  completedDays: Array<{ weekNumber: number; dayNumber: number }>
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'schedule': [weekNumber: number, dayNumber: number]
}>()

const formattedDate = computed(() => {
  return props.targetDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
})

function isDayScheduled(weekNumber: number, dayNumber: number): boolean {
  return props.scheduledWorkouts.some(sw => sw.weekNumber === weekNumber && sw.dayNumber === dayNumber)
}

function isDayCompleted(weekNumber: number, dayNumber: number): boolean {
  return props.completedDays.some(d => d.weekNumber === weekNumber && d.dayNumber === dayNumber)
}

function isDayDisabled(weekNumber: number, dayNumber: number): boolean {
  return isDayScheduled(weekNumber, dayNumber) || isDayCompleted(weekNumber, dayNumber)
}

function statusLabel(weekNumber: number, dayNumber: number): string | null {
  if (isDayCompleted(weekNumber, dayNumber)) return 'Completed'
  if (isDayScheduled(weekNumber, dayNumber)) return 'Scheduled'
  return null
}

function selectDay(weekNumber: number, dayNumber: number): void {
  if (isDayDisabled(weekNumber, dayNumber)) return
  emit('schedule', weekNumber, dayNumber)
}
</script>

<template>
  <USlideover
    :open="open"
    :title="`Schedule for ${formattedDate}`"
    description="Choose a workout to schedule"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="space-y-4 p-4">
        <div v-for="week in program.weeks" :key="week.id">
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Week {{ week.weekNumber }}
          </p>
          <div class="space-y-1.5">
            <button
              v-for="day in week.days"
              :key="day.id"
              class="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors overflow-hidden"
              :class="isDayDisabled(week.weekNumber, day.dayNumber)
                ? 'bg-slate-800/20 opacity-50 cursor-not-allowed'
                : 'bg-slate-800/30 hover:bg-slate-800/60 active:bg-slate-700/50'"
              :disabled="isDayDisabled(week.weekNumber, day.dayNumber)"
              @click="selectDay(week.weekNumber, day.dayNumber)"
            >
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-white">
                  Day {{ day.dayNumber }}
                  <span v-if="day.name" class="text-slate-400"> — {{ day.name }}</span>
                </p>
                <p v-if="statusLabel(week.weekNumber, day.dayNumber)" class="text-xs text-slate-500">
                  {{ statusLabel(week.weekNumber, day.dayNumber) }}
                </p>
              </div>
              <UIcon
                v-if="!isDayDisabled(week.weekNumber, day.dayNumber)"
                name="i-lucide-plus"
                class="size-4 shrink-0 text-slate-500"
              />
              <UIcon
                v-else-if="isDayCompleted(week.weekNumber, day.dayNumber)"
                name="i-lucide-check"
                class="size-4 shrink-0 text-emerald-500/50"
              />
              <UIcon
                v-else
                name="i-lucide-calendar-check"
                class="size-4 shrink-0 text-slate-500/50"
              />
            </button>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
