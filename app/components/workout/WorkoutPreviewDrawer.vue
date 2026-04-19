<script setup lang="ts">
interface PreviewSet {
  id: string
  setNumber: number
  reps: number | null
  weight: number | null
  rpe: number | null
  notes: string | null
  effortTarget: string | null
}

interface PreviewExercise {
  id: string
  order: number
  exercise: { id: string; name: string }
  sets: PreviewSet[]
}

interface PreviewGroup {
  id: string
  type: 'STANDARD' | 'SUPERSET'
  restSeconds: number | null
  exercises: PreviewExercise[]
}

interface PreviewDay {
  id: string
  dayNumber: number
  name: string | null
  warmUp: string | null
  exerciseGroups: PreviewGroup[]
}

const props = defineProps<{
  open: boolean
  day: PreviewDay | null
  weekNumber: number
  dayNumber: number
}>()

const emit = defineEmits<{
  close: []
}>()

const isOpen = computed({
  get: () => props.open,
  set: (v: boolean) => { if (!v) emit('close') },
})

function describeSet(set: PreviewSet): string {
  const parts: string[] = []
  if (set.effortTarget) {
    parts.push(set.effortTarget)
  } else if (set.reps !== null) {
    parts.push(`${set.reps} reps`)
  }
  if (set.weight !== null) {
    parts.push(`@ ${set.weight} lbs`)
  }
  if (parts.length === 0) return '—'
  return parts.join(' ')
}

function formatRest(seconds: number): string {
  if (seconds < 60) return `${seconds}s rest`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return secs > 0 ? `${mins}m ${secs}s rest` : `${mins}m rest`
}
</script>

<template>
  <UDrawer v-model:open="isOpen" direction="bottom">
    <template #content>
      <div class="mx-auto flex w-full max-w-lg flex-col" style="min-height: 75dvh; max-height: 75dvh;">
        <!-- Header -->
        <div class="flex shrink-0 items-center justify-between px-5 pb-3 pt-4">
          <div>
            <p class="text-xs text-slate-400">Preview</p>
            <h3 class="text-base font-semibold text-white">
              Week {{ weekNumber }} · Day {{ dayNumber }}
            </h3>
          </div>
          <button
            class="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            aria-label="Close preview"
            @click="emit('close')"
          >
            <UIcon name="i-lucide-x" class="size-5" />
          </button>
        </div>

        <!-- Scrollable body -->
        <div class="flex-1 overflow-y-auto px-5 pb-6">
          <!-- Warm-up -->
          <div v-if="day?.warmUp" class="mb-4 rounded-lg bg-amber-500/10 px-3 py-2.5">
            <p class="mb-0.5 text-xs font-medium uppercase tracking-wide text-amber-400">Warm-up</p>
            <p class="text-sm text-slate-300">{{ day.warmUp }}</p>
          </div>

          <!-- Exercise groups -->
          <div v-if="day" class="space-y-5">
            <div
              v-for="(group, gi) in day.exerciseGroups"
              :key="group.id"
            >
              <!-- Superset -->
              <template v-if="group.type === 'SUPERSET'">
                <p class="mb-2 text-xs font-medium uppercase tracking-wide text-violet-400">
                  {{ gi + 1 }}. Superset
                </p>
                <div class="grid grid-cols-2 gap-2">
                  <div
                    v-for="pe in group.exercises"
                    :key="pe.id"
                    class="flex flex-col rounded-lg border border-violet-500/20 bg-violet-500/5 p-3"
                  >
                    <p class="mb-1.5 text-sm font-semibold leading-snug text-white">
                      {{ pe.exercise.name }}
                    </p>
                    <ul class="mt-auto space-y-0.5">
                      <li
                        v-for="set in pe.sets"
                        :key="set.id"
                        class="flex items-baseline gap-2 text-sm text-slate-400"
                      >
                        <span class="w-10 shrink-0 text-xs text-slate-500">Set {{ set.setNumber }}</span>
                        <span class="text-slate-300">{{ describeSet(set) }}</span>
                        <span v-if="set.notes" class="text-xs text-slate-500">· {{ set.notes }}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </template>

              <!-- Standard -->
              <template v-else>
                <div
                  v-for="pe in group.exercises"
                  :key="pe.id"
                >
                  <p class="mb-1 text-sm font-semibold text-white">
                    {{ gi + 1 }}. {{ pe.exercise.name }}
                  </p>
                  <ul class="space-y-0.5">
                    <li
                      v-for="set in pe.sets"
                      :key="set.id"
                      class="flex items-baseline gap-2 text-sm text-slate-400"
                    >
                      <span class="w-10 shrink-0 text-xs text-slate-500">Set {{ set.setNumber }}</span>
                      <span class="text-slate-300">{{ describeSet(set) }}</span>
                      <span v-if="set.notes" class="text-xs text-slate-500">· {{ set.notes }}</span>
                    </li>
                  </ul>
                </div>
              </template>

              <!-- Rest -->
              <p
                v-if="group.restSeconds"
                class="mt-1.5 flex items-center gap-1 text-xs text-slate-500"
              >
                <UIcon name="i-lucide-timer" class="size-3.5" />
                {{ formatRest(group.restSeconds) }}
              </p>
            </div>
          </div>

          <!-- Empty state -->
          <p v-else class="py-6 text-center text-sm text-slate-500">
            No workout data available.
          </p>
        </div>
      </div>
    </template>
  </UDrawer>
</template>
