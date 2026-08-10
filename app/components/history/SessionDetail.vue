/**
 * Read-only rendering of a finished session: what was prescribed, what was
 * actually logged against it, and anything added on the fly.
 *
 * Both program and standalone sessions normalise into these props, since the
 * two APIs describe the same shape with different field names. Mirrors
 * `WorkoutDetailView.swift`.
 */
<script setup lang="ts">
export interface DetailSet {
  id: string
  setNumber: number
  reps: number | null
  weight: number | null
}

export interface DetailExercise {
  id: string
  name: string
  sets: DetailSet[]
}

export interface DetailGroup {
  id: string
  type: 'STANDARD' | 'SUPERSET'
  label?: string | null
  restSeconds: number | null
  exercises: DetailExercise[]
}

/** A set the user logged, keyed back to the prescribed set it satisfied. */
export interface DetailLoggedSet {
  setId: string | null
  exerciseId: string | null
  exerciseName: string | null
  reps: number | null
  weight: number | null
}

const props = defineProps<{
  completedAt: string
  groups: DetailGroup[]
  logged: DetailLoggedSet[]
  warmUp?: string | null
  notes?: string | null
}>()

const completedLabel = computed(() =>
  new Date(props.completedAt).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }),
)

/** Prescribed set id → what was logged against it. */
const loggedBySetId = computed(() => {
  const map = new Map<string, DetailLoggedSet>()
  for (const entry of props.logged) {
    if (entry.setId) map.set(entry.setId, entry)
  }
  return map
})

/**
 * Sets logged against an exercise but not against a prescribed set — the
 * "add a set" case. Rendered after the prescribed ones as "Extra N".
 */
function extrasFor(exerciseId: string): DetailLoggedSet[] {
  return props.logged.filter(entry => !entry.setId && entry.exerciseId === exerciseId)
}

/** Sets logged against an exercise that was never part of the template. */
const adHocGroups = computed(() => {
  const groups = new Map<string, DetailLoggedSet[]>()
  for (const entry of props.logged) {
    if (entry.setId || entry.exerciseId || !entry.exerciseName) continue
    const existing = groups.get(entry.exerciseName)
    if (existing) existing.push(entry)
    else groups.set(entry.exerciseName, [entry])
  }
  return [...groups.entries()].map(([name, sets]) => ({ name, sets }))
})

function formatLogged(entry: DetailLoggedSet | undefined): string | null {
  if (!entry) return null
  const parts: string[] = []
  if (entry.reps != null) parts.push(`${entry.reps} reps`)
  if (entry.weight != null) parts.push(`${entry.weight} lb`)
  return parts.length > 0 ? parts.join(' · ') : 'Logged'
}
</script>

<template>
  <div class="space-y-4">
    <div class="rounded-card bg-surface px-4 py-3">
      <p class="text-caption text-label-secondary">Completed</p>
      <p class="text-subheadline tnum">{{ completedLabel }}</p>
    </div>

    <div v-if="warmUp" class="rounded-card bg-ios-orange/10 px-4 py-3">
      <p class="text-caption font-semibold text-ios-orange">Warm-up</p>
      <p class="mt-1 whitespace-pre-line text-subheadline">{{ warmUp }}</p>
    </div>

    <section v-for="group in groups" :key="group.id" class="space-y-2">
      <div class="flex items-center justify-between px-1">
        <span class="text-caption font-semibold uppercase text-label-secondary">
          {{ group.label || (group.type === 'SUPERSET' ? 'Superset' : 'Standard') }}
        </span>
        <span v-if="group.restSeconds" class="text-caption text-label-tertiary">
          Rest {{ group.restSeconds }}s
        </span>
      </div>

      <div class="space-y-3 rounded-card bg-surface p-4">
        <div v-for="exercise in group.exercises" :key="exercise.id">
          <p class="text-headline">{{ exercise.name }}</p>

          <div
            v-for="set in exercise.sets"
            :key="set.id"
            class="flex items-baseline justify-between gap-3 py-0.5"
          >
            <span class="text-subheadline text-label-secondary">Set {{ set.setNumber }}</span>
            <span
              v-if="formatLogged(loggedBySetId.get(set.id))"
              class="text-subheadline tnum text-ios-green"
            >
              {{ formatLogged(loggedBySetId.get(set.id)) }}
            </span>
            <span v-else class="text-subheadline text-label-tertiary">Skipped</span>
          </div>

          <div
            v-for="(extra, index) in extrasFor(exercise.id)"
            :key="`extra-${index}`"
            class="flex items-baseline justify-between gap-3 py-0.5"
          >
            <span class="text-subheadline text-ios-orange">Extra {{ index + 1 }}</span>
            <span class="text-subheadline tnum text-ios-green">{{ formatLogged(extra) }}</span>
          </div>
        </div>
      </div>
    </section>

    <section v-if="adHocGroups.length > 0" class="space-y-2">
      <p class="px-1 text-caption font-semibold uppercase text-label-secondary">Added exercises</p>
      <div class="space-y-3 rounded-card bg-surface p-4">
        <div v-for="group in adHocGroups" :key="group.name">
          <p class="text-headline">{{ group.name }}</p>
          <div
            v-for="(set, index) in group.sets"
            :key="index"
            class="flex items-baseline justify-between gap-3 py-0.5"
          >
            <span class="text-subheadline text-label-secondary">Set {{ index + 1 }}</span>
            <span class="text-subheadline tnum text-ios-green">{{ formatLogged(set) }}</span>
          </div>
        </div>
      </div>
    </section>

    <section v-if="notes" class="space-y-2">
      <p class="px-1 text-caption font-semibold uppercase text-label-secondary">Notes</p>
      <p class="whitespace-pre-line rounded-card bg-surface p-4 text-subheadline">{{ notes }}</p>
    </section>
  </div>
</template>
