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

// --- Sparkline chart (same logic as analytics.vue) ---

const CHART_PAD_X = 16
const CHART_PAD_Y = 8
const PLOT_WIDTH = 268
const PLOT_HEIGHT = 64

const selectedPoint = ref<number | null>(null)

const chartPoints = computed(() => {
  if (!history.value) return []
  return history.value.history.filter(s => s.bestE1rm !== null)
})

const sparklinePoints = computed(() => {
  const pts = chartPoints.value
  if (pts.length === 0) return []
  const e1rms = pts.map(p => p.bestE1rm as number)
  const minE1rm = Math.min(...e1rms)
  const maxE1rm = Math.max(...e1rms)
  const range = maxE1rm - minE1rm
  return pts.map((p, i) => {
    const x = CHART_PAD_X + (pts.length === 1 ? PLOT_WIDTH / 2 : (i / (pts.length - 1)) * PLOT_WIDTH)
    const y = range === 0
      ? CHART_PAD_Y + PLOT_HEIGHT / 2
      : CHART_PAD_Y + PLOT_HEIGHT - (((p.bestE1rm as number) - minE1rm) / range) * PLOT_HEIGHT
    return { x, y, session: p }
  })
})

const polylinePointsStr = computed(() =>
  sparklinePoints.value.map(p => `${p.x},${p.y}`).join(' '),
)

function handleChartPointClick(index: number): void {
  selectedPoint.value = selectedPoint.value === index ? null : index
}

const e1rmInfoOpen = ref(false)

const displayHistory = computed(() => {
  if (!history.value) return []
  return [...history.value.history].reverse()
})

function formatVolume(lbs: number): string {
  return lbs >= 1000 ? `${(lbs / 1000).toFixed(1)}k` : lbs.toFixed(0)
}

function formatE1rm(e1rm: number): string {
  return `${Math.round(e1rm)} lbs`
}

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<template>
  <UDrawer v-model:open="isOpen" direction="bottom" title="Trend" :description="`Strength trend history for ${exerciseName ?? ''}`">
    <template #content>
      <div class="mx-auto w-full max-w-lg px-5 pb-8 pt-4" @click="e1rmInfoOpen = false">
        <!-- Header -->
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-white">Trend</h3>
          <button
            class="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            aria-label="Close"
            @click="emit('close')"
          >
            <UIcon name="i-lucide-x" class="size-5" />
          </button>
        </div>

        <!-- Loading -->
        <div v-if="status === 'pending'" class="flex flex-col items-center gap-3 py-10">
          <div class="size-6 animate-spin rounded-full border-2 border-slate-600 border-t-violet-400" />
          <p class="text-sm text-slate-400">
            Retrieving your trends for <strong class="text-white">{{ exerciseName }}</strong>
          </p>
        </div>

        <!-- Error -->
        <div v-else-if="status === 'error'" class="py-10 text-center text-sm text-red-400">
          Failed to load trend data. Please close and try again.
        </div>

        <!-- No history -->
        <div
          v-else-if="status === 'success' && history && history.history.length === 0"
          class="py-10 text-center text-sm text-slate-400"
        >
          No completed sessions found for this exercise yet.
        </div>

        <!-- Chart + session list -->
        <template v-else-if="status === 'success' && history">
          <!-- e1RM sparkline chart -->
          <div
            v-if="chartPoints.length > 0"
            class="mb-3 rounded-lg border border-slate-700/50 bg-slate-800/50 px-4 py-3"
          >
            <div class="mb-2 flex items-center gap-1.5">
              <p class="text-xs text-slate-400">
                e1RM Trend
              </p>
              <div class="relative">
                <button
                  type="button"
                  aria-label="What is e1RM?"
                  class="text-slate-600 transition-colors hover:text-slate-400"
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
                    class="absolute left-0 top-5 z-50 w-56 origin-top-left rounded-lg border border-slate-600/50 bg-slate-800 p-3 shadow-xl"
                  >
                    <p class="text-xs leading-relaxed text-slate-300">
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
              class="rounded-lg border border-slate-700/50 bg-slate-800/50 px-4 py-3"
            >
              <div class="flex items-start justify-between gap-2">
                <p class="text-sm font-medium text-white">
                  {{ formatSessionDate(session.completedAt) }}
                </p>
                <span class="shrink-0 text-xs text-slate-400">
                  {{ session.sets.length }} {{ session.sets.length === 1 ? 'set' : 'sets' }}
                </span>
              </div>
              <div class="mt-1 flex items-center gap-3">
                <span class="text-xs text-violet-400">
                  e1RM: {{ session.bestE1rm !== null ? formatE1rm(session.bestE1rm) : '—' }}
                </span>
                <span class="text-xs text-slate-400">
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
