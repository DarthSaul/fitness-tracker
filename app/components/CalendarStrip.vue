/**
 * Weekly calendar strip with month/year header and week navigation.
 * Displays Sun–Sat, highlights today, and allows navigating between weeks.
 */
<script setup lang="ts">
defineProps<{
  loading?: boolean
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

const weekDays = computed(() => {
  if (!now.value) return []
  const sunday = getSundayOfWeek(now.value, weekOffset.value)
  const today = new Date(now.value.getFullYear(), now.value.getMonth(), now.value.getDate())

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(sunday)
    date.setDate(sunday.getDate() + i)
    return {
      isoDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNumber: date.getDate(),
      isToday:
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate(),
    }
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
}

const isCurrentWeek = computed(() => weekOffset.value === 0)
</script>

<template>
  <div class="rounded-2xl bg-slate-800/30 p-4">
    <!-- Loading skeleton -->
    <template v-if="loading || weekDays.length === 0">
      <div class="mb-3 flex items-center justify-between">
        <div class="h-5 w-32 animate-pulse rounded bg-slate-800" />
        <div class="flex gap-1">
          <div class="h-8 w-8 animate-pulse rounded-lg bg-slate-800" />
          <div class="h-8 w-8 animate-pulse rounded-lg bg-slate-800" />
        </div>
      </div>
      <div class="flex justify-between">
        <div
          v-for="i in 7"
          :key="i"
          class="flex flex-col items-center gap-1"
        >
          <div class="h-4 w-8 animate-pulse rounded bg-slate-800" />
          <div class="h-10 w-10 animate-pulse rounded-lg bg-slate-800" />
        </div>
      </div>
    </template>

    <!-- Calendar -->
    <template v-else>
      <!-- Header: Month Year + nav arrows -->
      <div class="mb-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-slate-300">{{ monthYear }}</span>
          <button
            v-if="!isCurrentWeek"
            class="rounded-md bg-slate-700/50 px-2 text-xs leading-5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
            aria-label="Go to today"
            @click="goToToday"
          >
            Today
          </button>
        </div>
        <div class="flex gap-1">
          <button
            class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-white"
            aria-label="Previous week"
            @click="prevWeek"
          >
            <UIcon name="i-lucide-chevron-left" class="size-4" />
          </button>
          <button
            class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-white"
            aria-label="Next week"
            @click="nextWeek"
          >
            <UIcon name="i-lucide-chevron-right" class="size-4" />
          </button>
        </div>
      </div>

      <!-- Day strip -->
      <div class="flex justify-between">
        <div
          v-for="day in weekDays"
          :key="day.isoDate"
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
    </template>
  </div>
</template>
