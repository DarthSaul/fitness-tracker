/**
 * Weekly calendar strip with month/year header and week navigation, expandable
 * to a full month grid. The month/year label is pressable (chevron affordance,
 * mirroring the iOS CalendarStripView) and toggles between the single-row week
 * strip and a 6-week month grid. Highlights today, supports date selection,
 * schedule dot indicators, and a green border on past days with a completed
 * workout (iOS precedence: selection > today > completed).
 */
<script setup lang="ts">
import { toDateString, isSameDay, monthGridCells } from '../utils/date'

const props = defineProps<{
  loading?: boolean
  modelValue?: Date
  scheduledDates?: string[]
  completedDates?: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [date: Date]
}>()

const now = ref<Date | null>(null)
const weekOffset = ref(0)
const expanded = ref(false)
const monthOffset = ref(0)
let midnightTimeout: ReturnType<typeof setTimeout> | null = null

function scheduleMidnightUpdate(): void {
  const current = new Date()
  const midnight = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1)
  const msUntilMidnight = midnight.getTime() - current.getTime()
  midnightTimeout = setTimeout(() => {
    now.value = new Date()
    scheduleMidnightUpdate()
  }, msUntilMidnight)
}

onMounted(() => {
  now.value = new Date()
  scheduleMidnightUpdate()
})

onBeforeUnmount(() => {
  if (midnightTimeout) {
    clearTimeout(midnightTimeout)
  }
})

function getSundayOfWeek(today: Date, offset: number): Date {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const dayOfWeek = d.getDay() // 0 = Sunday
  const sunday = new Date(d)
  sunday.setDate(d.getDate() - dayOfWeek + offset * 7)
  return sunday
}

const selectedDate = computed(() => props.modelValue ?? null)

const scheduledSet = computed(() => new Set(props.scheduledDates ?? []))

const completedSet = computed(() => new Set(props.completedDates ?? []))

interface DayCell {
  date: Date
  dateKey: string
  dayNumber: number
  isToday: boolean
  isSelected: boolean
  hasScheduled: boolean
  hasCompleted: boolean
}

function makeDayCell(date: Date, today: Date): DayCell {
  const dateStr = toDateString(date)
  return {
    date,
    dateKey: dateStr,
    dayNumber: date.getDate(),
    isToday: isSameDay(date, today),
    isSelected: selectedDate.value ? isSameDay(date, selectedDate.value) : false,
    hasScheduled: scheduledSet.value.has(dateStr),
    // Only past days count as "completed" for the border — today shows its own
    // accent treatment instead, matching the iOS calendar.
    hasCompleted: date.getTime() < today.getTime() && completedSet.value.has(dateStr),
  }
}

const weekDays = computed(() => {
  if (!now.value) return []
  const sunday = getSundayOfWeek(now.value, weekOffset.value)
  const today = new Date(now.value.getFullYear(), now.value.getMonth(), now.value.getDate())

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(sunday)
    date.setDate(sunday.getDate() + i)
    return {
      ...makeDayCell(date, today),
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
    }
  })
})

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const monthAnchor = computed(() => {
  if (!now.value) return null
  return new Date(now.value.getFullYear(), now.value.getMonth() + monthOffset.value, 1)
})

const monthName = computed(() =>
  monthAnchor.value?.toLocaleDateString('en-US', { month: 'long' }) ?? '',
)

const monthCells = computed(() => {
  if (!now.value || !monthAnchor.value) return []
  const today = new Date(now.value.getFullYear(), now.value.getMonth(), now.value.getDate())
  return monthGridCells(monthAnchor.value.getFullYear(), monthAnchor.value.getMonth())
    .map((date) => (date ? makeDayCell(date, today) : null))
})

// Rows of 7, so the month renders with the same row markup as the week strip
// and the columns line up exactly between the two views. Fully-blank trailing
// rows (the constant 42-cell pad) are dropped rather than rendered as space.
const monthWeeks = computed(() => {
  const weeks: (DayCell | null)[][] = []
  for (let i = 0; i < monthCells.value.length; i += 7) {
    weeks.push(monthCells.value.slice(i, i + 7))
  }
  return weeks.filter((week) => week.some((cell) => cell !== null))
})

const monthYear = computed(() => {
  if (!now.value) return ''
  if (expanded.value) {
    return monthAnchor.value?.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) ?? ''
  }
  const sunday = getSundayOfWeek(now.value, weekOffset.value)
  return sunday.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
})

/** Whole weeks between today's week and the week containing `target`. */
function weekOffsetForDate(target: Date, today: Date): number {
  const thisSunday = getSundayOfWeek(today, 0)
  const targetSunday = getSundayOfWeek(target, 0)
  return Math.round((targetSunday.getTime() - thisSunday.getTime()) / (7 * 86_400_000))
}

function toggleExpanded(): void {
  if (!now.value) return
  if (expanded.value) {
    // Collapse back to the week containing the selection (or today), so the
    // strip lines up with whatever the user picked in the month grid.
    weekOffset.value = selectedDate.value
      ? weekOffsetForDate(selectedDate.value, now.value)
      : 0
    expanded.value = false
  } else {
    const sunday = getSundayOfWeek(now.value, weekOffset.value)
    monthOffset.value =
      (sunday.getFullYear() - now.value.getFullYear()) * 12 +
      (sunday.getMonth() - now.value.getMonth())
    expanded.value = true
  }
}

function prev(): void {
  if (expanded.value) monthOffset.value--
  else weekOffset.value--
}

function next(): void {
  if (expanded.value) monthOffset.value++
  else weekOffset.value++
}

function goToToday(): void {
  weekOffset.value = 0
  monthOffset.value = 0
  if (now.value) {
    emit('update:modelValue', new Date(now.value.getFullYear(), now.value.getMonth(), now.value.getDate()))
  }
}

function selectDay(date: Date): void {
  emit('update:modelValue', new Date(date.getFullYear(), date.getMonth(), date.getDate()))
}

const isViewingCurrent = computed(() =>
  expanded.value ? monthOffset.value === 0 : weekOffset.value === 0,
)

function dayCellClasses(day: DayCell): string {
  if (day.isSelected && day.isToday) return 'bg-tint text-white'
  if (day.isSelected) return 'bg-tint/25 text-tint ring-1 ring-tint'
  const base = day.isToday ? 'bg-tint/15 text-tint' : 'bg-fill text-label-secondary'
  return day.hasCompleted ? `${base} ring-1 ring-ios-green/50` : base
}

function dayAriaLabel(base: string, day: DayCell): string {
  let label = base
  if (day.hasScheduled) label += ', scheduled workout'
  if (day.hasCompleted) label += ', completed workout'
  if (day.isToday) label += ', today'
  return label
}
</script>

<template>
  <div class="rounded-card bg-surface p-4">
    <!-- Loading skeleton -->
    <template v-if="loading || weekDays.length === 0">
      <div class="mb-3 flex items-center justify-between">
        <AppSkeleton :height="20" :width="128" />
        <div class="flex gap-1">
          <AppSkeleton :height="32" :width="32" />
          <AppSkeleton :height="32" :width="32" />
        </div>
      </div>
      <div class="flex justify-between">
        <div
          v-for="i in 7"
          :key="i"
          class="flex flex-col items-center gap-1"
        >
          <AppSkeleton :height="16" :width="32" />
          <AppSkeleton :height="40" :width="40" />
        </div>
      </div>
    </template>

    <!-- Calendar -->
    <template v-else>
      <!-- Header: pressable Month Year + nav arrows -->
      <div class="mb-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <button
            class="flex items-center gap-1 text-sm font-medium text-label transition-colors hover:text-label-secondary"
            :aria-expanded="expanded"
            :aria-label="expanded ? 'Close month calendar' : 'Open month calendar'"
            @click="toggleExpanded"
          >
            {{ monthYear }}
            <UIcon
              name="i-lucide-chevron-down"
              class="size-3.5 text-label-secondary transition-transform"
              :class="expanded ? 'rotate-180' : ''"
            />
          </button>
          <button
            v-if="!isViewingCurrent"
            class="rounded-chip bg-label-secondary/15 px-2 text-xs leading-5 text-label-secondary transition-colors hover:bg-label-secondary/15 hover:text-label"
            aria-label="Go to today"
            @click="goToToday"
          >
            Today
          </button>
        </div>
        <div class="flex gap-1">
          <button
            class="flex h-8 w-8 items-center justify-center rounded-tile text-label-secondary transition-colors hover:bg-label-secondary/15 hover:text-label"
            :aria-label="expanded ? 'Previous month' : 'Previous week'"
            @click="prev"
          >
            <UIcon name="i-lucide-chevron-left" class="size-4" />
          </button>
          <button
            class="flex h-8 w-8 items-center justify-center rounded-tile text-label-secondary transition-colors hover:bg-label-secondary/15 hover:text-label"
            :aria-label="expanded ? 'Next month' : 'Next week'"
            @click="next"
          >
            <UIcon name="i-lucide-chevron-right" class="size-4" />
          </button>
        </div>
      </div>

      <!-- Day strip -->
      <div v-if="!expanded" class="flex justify-between">
        <button
          v-for="day in weekDays"
          :key="day.dateKey"
          class="flex flex-col items-center gap-1"
          :aria-label="dayAriaLabel(`Select ${day.dayName} ${day.dayNumber}`, day)"
          :aria-pressed="day.isSelected"
          @click="selectDay(day.date)"
        >
          <span
            class="text-xs"
            :class="day.isToday || day.isSelected ? 'text-label font-semibold' : 'text-label-secondary'"
          >
            {{ day.dayName }}
          </span>
          <div
            class="flex h-10 w-10 items-center justify-center rounded-tile text-sm font-medium tnum transition-colors"
            :class="dayCellClasses(day)"
          >
            {{ day.dayNumber }}
          </div>
          <!-- Schedule dot indicator -->
          <div class="h-1.5">
            <div
              v-if="day.hasScheduled"
              class="h-1.5 w-1.5 rounded-full bg-ios-green"
            />
          </div>
        </button>
      </div>

      <!-- Month grid. Rows reuse the week strip's exact geometry — fixed w-10
           tiles spread with justify-between — so the columns don't shift when
           the card expands or collapses. -->
      <template v-else>
        <div class="flex justify-between">
          <span
            v-for="d in WEEKDAYS"
            :key="d"
            class="w-10 text-center text-xs text-label-secondary"
          >
            {{ d }}
          </span>
        </div>
        <div
          v-for="(week, w) in monthWeeks"
          :key="w"
          class="mt-1 flex justify-between"
        >
          <template v-for="(cell, i) in week" :key="cell ? cell.dateKey : `blank-${w}-${i}`">
            <button
              v-if="cell"
              class="flex flex-col items-center gap-1"
              :aria-label="dayAriaLabel(`Select ${monthName} ${cell.dayNumber}`, cell)"
              :aria-pressed="cell.isSelected"
              @click="selectDay(cell.date)"
            >
              <div
                class="flex h-10 w-10 items-center justify-center rounded-tile text-sm font-medium tnum transition-colors"
                :class="dayCellClasses(cell)"
              >
                {{ cell.dayNumber }}
              </div>
              <!-- Schedule dot indicator -->
              <div class="h-1.5">
                <div
                  v-if="cell.hasScheduled"
                  class="h-1.5 w-1.5 rounded-full bg-ios-green"
                />
              </div>
            </button>
            <div v-else class="w-10" />
          </template>
        </div>
      </template>
    </template>
  </div>
</template>
