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
          role="button"
          tabindex="0"
          :aria-label="`View Week ${week.weekNumber}`"
          class="cursor-pointer transition-colors hover:bg-slate-800/50"
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
        <div v-else class="space-y-6 p-4">
          <div v-for="day in weekDays" :key="day.id">
            <!-- Day header -->
            <h4 class="text-base font-semibold text-white">
              Day {{ day.dayNumber }}<span v-if="day.name" class="text-slate-400"> — {{ day.name }}</span>
            </h4>

            <!-- Warm-up -->
            <p v-if="day.warmUp" class="mt-1 text-sm text-amber-400/80">
              Warm-up: {{ day.warmUp }}
            </p>

            <!-- Exercise groups -->
            <div class="mt-3 space-y-4">
              <div
                v-for="group in day.exerciseGroups"
                :key="group.id"
                class="rounded-lg bg-slate-800/50 p-3"
              >
                <!-- Superset label -->
                <span
                  v-if="group.type === 'SUPERSET'"
                  class="mb-2 inline-block rounded bg-indigo-500/20 px-2 py-0.5 text-xs font-medium text-indigo-300"
                >
                  Superset
                </span>

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

                <!-- Rest period -->
                <p v-if="group.restSeconds != null" class="mt-2 text-xs text-slate-500">
                  Rest: {{ group.restSeconds }}s
                </p>
              </div>
            </div>
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>
