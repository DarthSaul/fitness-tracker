/**
 * "Strength on the Go" — the standalone workout library, grouped by category.
 * Mirrors `StandaloneWorkoutListView.swift`.
 */
<script setup lang="ts">
import type { StandaloneWorkoutSummary, ActiveStandaloneSession } from '~/types/standalone'

definePageMeta({
  layout: 'app',
  header: { title: 'Strength on the Go', style: 'inline' },
})

const { data: workouts, status } = await useFetch<StandaloneWorkoutSummary[]>(
  '/api/standalone-workouts',
  { server: false },
)

const { data: active } = await useFetch<{ sessions: ActiveStandaloneSession[] }>(
  '/api/standalone-workout-sessions/active',
  { server: false },
)

/** Workout id → in-progress session, so rows can show a Resume state. */
const activeByWorkout = computed(() => {
  const map = new Map<string, ActiveStandaloneSession>()
  for (const session of active.value?.sessions ?? []) {
    map.set(session.standaloneWorkoutId, session)
  }
  return map
})

// The endpoint already orders by (category, order), so grouping preserves it.
const categories = computed(() => {
  const groups = new Map<string, StandaloneWorkoutSummary[]>()
  for (const workout of workouts.value ?? []) {
    const existing = groups.get(workout.category)
    if (existing) existing.push(workout)
    else groups.set(workout.category, [workout])
  }
  return [...groups.entries()].map(([name, items]) => ({ name, items }))
})
</script>

<template>
  <div class="space-y-6">
    <p class="text-subheadline text-label-secondary">
      Quick 30–45 minute workouts you can do anywhere, with no program required.
    </p>

    <AppSkeleton v-if="status === 'pending'" :height="72" :count="5" />

    <div v-else-if="categories.length === 0" class="flex flex-col items-center gap-3 py-16 text-center">
      <UIcon name="i-lucide-dumbbell" class="size-8 text-label-tertiary" />
      <p class="text-headline">No workouts available</p>
    </div>

    <section v-for="category in categories" :key="category.name" class="space-y-2">
      <p class="px-1 text-caption font-semibold uppercase text-label-secondary">{{ category.name }}</p>
      <div class="divide-y divide-separator overflow-hidden rounded-card bg-surface">
        <NuxtLink
          v-for="workout in category.items"
          :key="workout.id"
          :to="`/standalone-workouts/${workout.id}`"
          class="flex items-center gap-3 px-4 py-3"
        >
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-2">
              <span class="truncate text-headline">{{ workout.name }}</span>
              <AppStatusBadge v-if="activeByWorkout.has(workout.id)" label="In progress" color="green" />
            </span>
            <span v-if="workout.description" class="mt-0.5 line-clamp-2 block text-subheadline text-label-secondary">
              {{ workout.description }}
            </span>
            <span class="mt-0.5 block text-caption tnum text-label-tertiary">
              {{ workout._count.groups }} {{ workout._count.groups === 1 ? 'group' : 'groups' }}
            </span>
          </span>
          <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-label-tertiary" />
        </NuxtLink>
      </div>
    </section>
  </div>
</template>
