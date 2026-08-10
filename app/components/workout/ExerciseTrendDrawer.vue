<script setup lang="ts">

import type { AnalyticsExerciseHistory } from '~/composables/useAnalytics'

const props = defineProps<{
  open: boolean
  exerciseId: string | null
  exerciseName: string | null
}>()

const emit = defineEmits<{
  close: []
}>()

const isOpen = computed({
  get: () => props.open,
  set: (v: boolean) => { if (!v) emit('close') },
})

const history = ref<AnalyticsExerciseHistory | null>(null)
const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

watch(() => props.open, async (opened) => {
  if (opened && props.exerciseId) {
    history.value = null
    status.value = 'pending'
    selectedPoint.value = null
    e1rmInfoOpen.value = false
    try {
      const result = await $fetch<AnalyticsExerciseHistory>(
        `/api/analytics/exercises/${encodeURIComponent(props.exerciseId)}`,
      )
      history.value = result
      status.value = 'success'
    } catch {
      status.value = 'error'
    }
  }
})

// --- Sparkline chart (geometry shared with the analytics page) ---

const selectedPoint = ref<number | null>(null)

const sparklinePoints = computed(() => buildSparkline(history.value?.history ?? []))

const polylinePointsStr = computed(() => toPolylinePoints(sparklinePoints.value))

function handleChartPointClick(index: number): void {
  selectedPoint.value = selectedPoint.value === index ? null : index
}

const e1rmInfoOpen = ref(false)

const displayHistory = computed(() => {
  if (!history.value) return []
  return [...history.value.history].reverse()
})
</script>

<template>
  <UDrawer v-model:open="isOpen" direction="bottom" title="Trend" :description="`Strength trend history for ${exerciseName ?? ''}`">
    <template #content>
      <div class="mx-auto w-full max-w-lg px-5 pb-8 pt-4" @click="e1rmInfoOpen = false">
        <!-- Header -->
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-label">Trend</h3>
          <button
            class="rounded-full p-1.5 text-label-secondary transition-colors hover:bg-label-secondary/10 hover:text-label"
            aria-label="Close"
            @click="emit('close')"
          >
            <UIcon name="i-lucide-x" class="size-5" />
          </button>
        </div>

        <!-- Loading -->
        <div v-if="status === 'pending'" class="flex flex-col items-center gap-3 py-10">
          <div class="size-6 animate-spin rounded-full border-2 border-separator border-t-violet-400" />
          <p class="text-sm text-label-secondary">
            Retrieving your trends for <strong class="text-label">{{ exerciseName }}</strong>
          </p>
        </div>

        <!-- Error -->
        <div v-else-if="status === 'error'" class="py-10 text-center text-sm text-ios-red">
          Failed to load trend data. Please close and try again.
        </div>

        <!-- No history -->
        <div
          v-else-if="status === 'success' && history && history.history.length === 0"
          class="py-10 text-center text-sm text-label-secondary"
        >
          No completed sessions found for this exercise yet.
        </div>

        <!-- Chart + session list -->
        <template v-else-if="status === 'success' && history">
          <!-- e1RM sparkline chart -->
          <div
            v-if="sparklinePoints.length > 0"
            class="mb-3 rounded-tile border border-separator bg-surface px-4 py-3"
          >
            <div class="mb-2 flex items-center gap-1.5">
              <p class="text-xs text-label-secondary">
                e1RM Trend
              </p>
              <div class="relative">
                <button
                  type="button"
                  aria-label="What is e1RM?"
                  class="text-label-tertiary transition-colors hover:text-label-secondary"
                  @click.stop="e1rmInfoOpen = !e1rmInfoOpen"
                >
                  <UIcon name="i-lucide-info" class="size-3" />
                </button>
                <Transition
                  enter-active-class="transition-all duration-150 ease-out"
                  enter-from-class="opacity-0 scale-95"
                  enter-to-class="opacity-100 scale-100"
                  leave-active-class="transition-all duration-100 ease-in"
                  leave-from-class="opacity-100 scale-100"
                  leave-to-class="opacity-0 scale-95"
                >
                  <div
                    v-if="e1rmInfoOpen"
                    class="absolute left-0 top-5 z-50 w-56 origin-top-left rounded-tile border border-separator bg-fill p-3 shadow-xl"
                  >
                    <p class="text-xs leading-relaxed text-label">
                      Estimated 1-Rep Max (e1RM) is a way to estimate the maximum weight you could lift for a single rep, based on any set you actually performed.
                    </p>
                  </div>
                </Transition>
              </div>
            </div>
            <div class="relative">
              <svg viewBox="0 0 300 80" width="100%" height="80" class="overflow-visible">
                <polyline
                  v-if="sparklinePoints.length > 1"
                  :points="polylinePointsStr"
                  fill="none"
                  stroke="#8b5cf6"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <g
                  v-for="(pt, i) in sparklinePoints"
                  :key="i"
                  class="cursor-pointer"
                  @click="handleChartPointClick(i)"
                >
                  <circle :cx="pt.x" :cy="pt.y" r="4" fill="#8b5cf6" stroke="#1e1b4b" stroke-width="2" />
                  <circle :cx="pt.x" :cy="pt.y" r="12" fill="transparent" />
                </g>
                <template v-if="selectedPoint !== null && sparklinePoints[selectedPoint]">
                  <text
                    :x="sparklinePoints[selectedPoint]!.x"
                    :y="sparklinePoints[selectedPoint]!.y - 12"
                    text-anchor="middle"
                    fill="#c4b5fd"
                    font-size="9"
                    font-weight="600"
                  >{{ formatE1rm(sparklinePoints[selectedPoint]!.session.bestE1rm as number) }}</text>
                  <text
                    :x="sparklinePoints[selectedPoint]!.x"
                    :y="sparklinePoints[selectedPoint]!.y - 22"
                    text-anchor="middle"
                    fill="#94a3b8"
                    font-size="8"
                  >{{ formatSessionDate(sparklinePoints[selectedPoint]!.session.completedAt) }}</text>
                </template>
              </svg>
            </div>
          </div>

          <!-- Session list -->
          <div class="max-h-64 space-y-2 overflow-y-auto">
            <div
              v-for="session in displayHistory"
              :key="session.sessionId"
              class="rounded-tile border border-separator bg-surface px-4 py-3"
            >
              <div class="flex items-start justify-between gap-2">
                <p class="text-sm font-medium text-label">
                  {{ formatSessionDate(session.completedAt) }}
                </p>
                <span class="shrink-0 text-xs text-label-secondary">
                  {{ session.sets.length }} {{ session.sets.length === 1 ? 'set' : 'sets' }}
                </span>
              </div>
              <div class="mt-1 flex items-center gap-3">
                <span class="text-xs text-tint">
                  e1RM: {{ session.bestE1rm !== null ? formatE1rm(session.bestE1rm) : '—' }}
                </span>
                <span class="text-xs text-label-secondary">
                  Vol: {{ session.totalVolume !== null ? `${formatVolume(session.totalVolume)} lbs` : '—' }}
                </span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>
  </UDrawer>
</template>
