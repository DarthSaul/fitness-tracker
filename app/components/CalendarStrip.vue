/**
 * Weekly calendar strip with month/year header and week navigation.
 * Displays Sun–Sat, highlights today, supports date selection and schedule dot indicators.
 */
<script setup lang="ts">
const props = defineProps<{
  loading?: boolean
  modelValue?: Date
  scheduledDates?: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [date: Date]
}>()

const now = ref<Date | null>(null)
const weekOffset = ref(0)
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

import { toDateString, isSameDay } from '~/utils/date'

const selectedDate = computed(() => props.modelValue ?? null)

const scheduledSet = computed(() => new Set(props.scheduledDates ?? []))

const weekDays = computed(() => {
  if (!now.value) return []
  const sunday = getSundayOfWeek(now.value, weekOffset.value)
  const today = new Date(now.value.getFullYear(), now.value.getMonth(), now.value.getDate())

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(sunday)
    date.setDate(sunday.getDate() + i)
    const isToday = isSameDay(date, today)
    const isSelected = selectedDate.value ? isSameDay(date, selectedDate.value) : false
    const dateStr = toDateString(date)
    const hasScheduled = scheduledSet.value.has(dateStr)
    return { date, dateKey: dateStr, dayName: date.toLocaleDateString('en-US', { weekday: 'short' }), dayNumber: date.getDate(), isToday, isSelected, hasScheduled }
  })
})

const monthYear = computed(() => {
  if (!now.value) return ''
  const sunday = getSundayOfWeek(now.value, weekOffset.value)
  return sunday.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
})

function prevWeek(): void {
  weekOffset.value--
}

function nextWeek(): void {
  weekOffset.value++
}

function goToToday(): void {
  weekOffset.value = 0
  if (now.value) {
    emit('update:modelValue', new Date(now.value.getFullYear(), now.value.getMonth(), now.value.getDate()))
  }
}

function selectDay(date: Date): void {
  emit('update:modelValue', new Date(date.getFullYear(), date.getMonth(), date.getDate()))
}

const isCurrentWeek = computed(() => weekOffset.value === 0)
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
      <!-- Header: Month Year + nav arrows -->
      <div class="mb-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-label">{{ monthYear }}</span>
          <button
            v-if="!isCurrentWeek"
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
            aria-label="Previous week"
            @click="prevWeek"
          >
            <UIcon name="i-lucide-chevron-left" class="size-4" />
          </button>
          <button
            class="flex h-8 w-8 items-center justify-center rounded-tile text-label-secondary transition-colors hover:bg-label-secondary/15 hover:text-label"
            aria-label="Next week"
            @click="nextWeek"
          >
            <UIcon name="i-lucide-chevron-right" class="size-4" />
          </button>
        </div>
      </div>

      <!-- Day strip -->
      <div class="flex justify-between">
        <button
          v-for="day in weekDays"
          :key="day.dateKey"
          class="flex flex-col items-center gap-1"
          :aria-label="`Select ${day.dayName} ${day.dayNumber}`"
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
            :class="[
              day.isSelected && day.isToday
                ? 'bg-tint text-white'
                : day.isSelected
                  ? 'bg-tint/25 text-tint ring-1 ring-tint'
                  : day.isToday
                    ? 'bg-tint/15 text-tint'
                    : 'bg-fill text-label-secondary',
            ]"
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
    </template>
  </div>
</template>
