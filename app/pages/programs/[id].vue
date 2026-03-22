<script setup lang="ts">
definePageMeta({ layout: 'app' })

import type { ProgramDetail, ProgramWeekSummary, ProgramDayDetail, ExerciseSetDetail } from '~/types/program'

const route = useRoute()
const programId = computed(() => route.params.id as string)

const { data: program, status } = useFetch<ProgramDetail>(() => `/api/programs/${programId.value}`)
const { isSaved, isSaving, toggleSave, isActive, isActivating, toggleActive } = useUserPrograms()

const slideoverOpen = ref(false)
const selectedWeek = ref<ProgramWeekSummary | null>(null)
const weekDays = ref<ProgramDayDetail[]>([])
const loadingDays = ref(false)
let openWeekRequestId = 0
const expandedDays = ref(new Set<string>())

function toggleDay(dayId: string): void {
  if (expandedDays.value.has(dayId)) {
    expandedDays.value.delete(dayId)
  } else {
    expandedDays.value.add(dayId)
  }
}

function formatRange(values: number[]): string | null {
  if (!values.length) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  return min === max ? `${min}` : `${min}–${max}`
}

function repsRange(sets: ExerciseSetDetail[]): string | null {
  return formatRange(sets.map(s => s.reps).filter((r): r is number => r != null))
}

function weightRange(sets: ExerciseSetDetail[]): string | null {
  const range = formatRange(sets.map(s => s.weight).filter((w): w is number => w != null))
  return range ? `${range} lbs` : null
}

function rpeRange(sets: ExerciseSetDetail[]): string | null {
  return formatRange(sets.map(s => s.rpe).filter((r): r is number => r != null))
}

async function openWeek(week: ProgramWeekSummary): Promise<void> {
  const requestId = ++openWeekRequestId
  selectedWeek.value = week
  weekDays.value = []
  slideoverOpen.value = true
  loadingDays.value = true
  try {
    const days = await Promise.all(
      week.days.map(dayId => $fetch<ProgramDayDetail>(`/api/programs/days/${dayId}`))
    )
    if (requestId === openWeekRequestId) {
      weekDays.value = days
      expandedDays.value = new Set(days.length ? [days[0].id] : [])
    }
  } catch {
    if (requestId === openWeekRequestId) {
      weekDays.value = []
    }
  } finally {
    if (requestId === openWeekRequestId) {
      loadingDays.value = false
    }
  }
}

function onCardKeydown(week: ProgramWeekSummary, event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    openWeek(week)
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-3">
      <NuxtLink to="/programs">
        <UButton
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          size="sm"
        />
      </NuxtLink>
      <h2 class="text-lg font-semibold text-white">
        <template v-if="program">{{ program.name }}</template>
        <template v-else>Program</template>
      </h2>
      <div v-if="program" class="ml-auto flex shrink-0 items-center gap-2">
        <UButton
          :icon="isSaved(program.id) ? 'i-lucide-bookmark-check' : 'i-lucide-bookmark'"
          :color="isSaved(program.id) ? 'primary' : 'neutral'"
          :variant="isSaved(program.id) ? 'solid' : 'outline'"
          size="sm"
          :loading="isSaving(program.id)"
          @click="toggleSave(program.id)"
        >
          {{ isSaved(program.id) ? 'Saved' : 'Save' }}
        </UButton>
        <UButton
          v-if="isSaved(program.id)"
          :icon="isActive(program.id) ? 'i-lucide-circle-check' : 'i-lucide-play'"
          :color="isActive(program.id) ? 'success' : 'neutral'"
          :variant="isActive(program.id) ? 'soft' : 'outline'"
          size="sm"
          :loading="isActivating(program.id)"
          @click="toggleActive(program.id)"
        >
          {{ isActive(program.id) ? 'Active' : 'Start' }}
        </UButton>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="status === 'pending'" class="space-y-4">
      <div class="h-20 animate-pulse rounded-lg bg-slate-800" />
      <div class="h-32 animate-pulse rounded-lg bg-slate-800" />
    </div>

    <!-- Error state -->
    <UCard v-else-if="status === 'error'">
      <div class="text-center text-red-400">
        <p>Failed to load program.</p>
        <p class="mt-1 text-sm">
          Please try again later.
        </p>
      </div>
    </UCard>

    <!-- Program detail -->
    <template v-else-if="program">
      <!-- Description -->
      <p v-if="program.description" class="text-sm text-slate-400">
        {{ program.description }}
      </p>
      <p v-else class="text-sm text-slate-500 italic">
        No description available.
      </p>

      <!-- Weeks -->
      <div class="space-y-4">
        <h3 class="text-sm font-medium text-slate-300">
          Schedule
        </h3>
        <UCard
          v-for="week in program.weeks"
          :key="week.id"
          v-wave
          role="button"
          tabindex="0"
          :aria-label="`View Week ${week.weekNumber}`"
          class="overflow-hidden cursor-pointer transition-colors hover:bg-slate-800/50"
          @click="openWeek(week)"
          @keydown="onCardKeydown(week, $event)"
        >
          <div class="flex items-center justify-between">
            <div>
              <h4 class="font-semibold text-white">
                Week {{ week.weekNumber }}
              </h4>
              <p class="mt-1 text-sm text-slate-400">
                {{ week.days.length }} {{ week.days.length === 1 ? 'day' : 'days' }}
              </p>
            </div>
            <UIcon name="i-lucide-chevron-right" class="size-5 text-slate-500" />
          </div>
        </UCard>
      </div>
    </template>

    <!-- Week detail slideover -->
    <USlideover
      v-model:open="slideoverOpen"
      :title="selectedWeek ? `Week ${selectedWeek.weekNumber}` : 'Week'"
      :description="`${selectedWeek?.days.length ?? 0} day schedule`"
    >
      <template #body>
        <!-- Loading days -->
        <div v-if="loadingDays" class="space-y-4 p-4">
          <div v-for="n in (selectedWeek?.days.length ?? 2)" :key="n" class="h-24 animate-pulse rounded-lg bg-slate-800" />
        </div>

        <!-- Day details -->
        <div v-else class="space-y-2 p-4">
          <div
            v-for="day in weekDays"
            :key="day.id"
            class="rounded-lg transition-colors duration-200"
            :class="expandedDays.has(day.id) ? '' : 'bg-slate-800/40'"
          >
            <!-- Day header (toggle) -->
            <button
              class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-800/50"
              @click="toggleDay(day.id)"
            >
              <h4 class="min-w-0 flex-1 text-base font-semibold text-white">
                Day {{ day.dayNumber }}<span v-if="day.name" class="text-slate-400"> — {{ day.name }}</span>
              </h4>
              <UIcon
                :name="expandedDays.has(day.id) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                class="size-5 shrink-0 text-slate-400"
              />
            </button>

            <!-- Collapsible content -->
            <div
              class="grid overflow-hidden transition-all duration-200 ease-in-out"
              :class="expandedDays.has(day.id) ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
            >
              <div class="min-h-0">
                <div class="space-y-4 px-3 pb-3 pt-1">
                  <!-- Superset group -->
                  <div
                    v-for="group in day.exerciseGroups"
                    :key="group.id"
                    :class="group.type === 'SUPERSET'
                      ? 'relative rounded-xl border border-indigo-500/25 p-3 pt-4'
                      : 'rounded-lg bg-slate-800/50 p-3'"
                  >
                    <span
                      v-if="group.type === 'SUPERSET'"
                      class="absolute -left-2 -top-2 flex size-5 items-center justify-center rounded-full border border-indigo-500/40 bg-slate-950 text-[8px] font-semibold text-indigo-300"
                    >SS</span>

                    <!-- Exercises in group -->
                    <div
                      v-for="(ex, exIdx) in group.exercises"
                      :key="ex.id"
                      :class="{ 'mt-3 border-t border-slate-700 pt-3': exIdx > 0 }"
                    >
                      <p class="font-medium text-white">{{ ex.exercise.name }}</p>
                      <p v-if="ex.exercise.description" class="mt-0.5 text-xs text-slate-500">
                        {{ ex.exercise.description }}
                      </p>

                      <!-- Sets summary -->
                      <div v-if="ex.sets.length" class="mt-2 flex flex-wrap gap-2 text-xs">
                        <span class="rounded-md bg-slate-700/60 px-2 py-0.5 text-slate-300">
                          {{ ex.sets.length }} {{ ex.sets.length === 1 ? 'set' : 'sets' }}
                        </span>
                        <span v-if="repsRange(ex.sets)" class="rounded-md bg-slate-700/60 px-2 py-0.5 text-slate-300">
                          {{ repsRange(ex.sets) }} reps
                        </span>
                        <span v-if="weightRange(ex.sets)" class="rounded-md bg-slate-700/60 px-2 py-0.5 text-slate-300">
                          {{ weightRange(ex.sets) }}
                        </span>
                        <span v-if="rpeRange(ex.sets)" class="rounded-md bg-slate-700/60 px-2 py-0.5 text-slate-300">
                          RPE {{ rpeRange(ex.sets) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>
