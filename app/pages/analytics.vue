<script setup lang="ts">
/**
 * Analytics page — strength progress dashboard with e1RM sparklines per exercise.
 */
definePageMeta({ layout: 'app' })

const {
  dashboard,
  dashboardStatus,
  exercises,
  exercisesStatus,
  exerciseHistory,
  historyStatus,
  selectedExerciseId,
  selectExercise,
} = useAnalytics()

const e1rmInfoOpen = ref(false)

function formatVolume(lbs: number): string {
  return lbs >= 1000 ? `${(lbs / 1000).toFixed(1)}k` : lbs.toFixed(0)
}

function formatE1rm(e1rm: number): string {
  return `${Math.round(e1rm)} lbs`
}

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// --- Sparkline chart logic ---

const CHART_PAD_X = 16
const CHART_PAD_Y = 8
const PLOT_WIDTH = 268   // 300 - 16*2
const PLOT_HEIGHT = 64   // 80 - 8*2

const selectedPoint = ref<number | null>(null)

// Sessions with a valid e1RM for chart plotting
const chartPoints = computed(() => {
  if (!exerciseHistory.value) return []
  return exerciseHistory.value.history.filter(s => s.bestE1rm !== null)
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
  sparklinePoints.value.map(p => `${p.x},${p.y}`).join(' ')
)

function handleChartPointClick(index: number) {
  selectedPoint.value = selectedPoint.value === index ? null : index
}

// Reset selected point when exercise changes
watch(selectedExerciseId, () => {
  selectedPoint.value = null
})

// Display history in reverse chronological order
const displayHistory = computed(() => {
  if (!exerciseHistory.value) return []
  return [...exerciseHistory.value.history].reverse()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Page header -->
    <div>
      <h2 class="text-lg font-semibold text-white">
        Analytics
      </h2>
      <p class="mt-1 text-sm text-slate-400">
        Track your strength progress over time
      </p>
    </div>

    <!-- Section 1: Dashboard stats -->
    <div v-if="dashboardStatus === 'pending'" class="grid grid-cols-3 gap-3">
      <div v-for="i in 3" :key="i" class="h-16 animate-pulse rounded-lg bg-slate-800" />
    </div>

    <div v-else-if="dashboard" class="grid grid-cols-3 gap-3">
      <!-- Total Sessions -->
      <div class="rounded-lg bg-slate-800/50 border border-slate-700/50 px-3 py-2.5">
        <UIcon name="i-lucide-calendar-check" class="size-4 text-violet-400 mb-1" />
        <p class="text-lg font-semibold text-white leading-none">
          {{ dashboard.totalSessions }}
        </p>
        <p class="text-xs text-slate-400 mt-0.5">
          Sessions
        </p>
      </div>

      <!-- Total Volume -->
      <div class="rounded-lg bg-slate-800/50 border border-slate-700/50 px-3 py-2.5">
        <UIcon name="i-lucide-weight" class="size-4 text-violet-400 mb-1" />
        <p class="text-lg font-semibold text-white leading-none">
          {{ formatVolume(dashboard.totalVolumeLbs) }}
        </p>
        <p class="text-xs text-slate-400 mt-0.5">
          lbs total
        </p>
      </div>

      <!-- Current Streak -->
      <div class="rounded-lg bg-slate-800/50 border border-slate-700/50 px-3 py-2.5">
        <UIcon name="i-lucide-flame" class="size-4 text-violet-400 mb-1" />
        <p class="text-lg font-semibold text-white leading-none">
          {{ dashboard.currentStreakDays }}
        </p>
        <p class="text-xs text-slate-400 mt-0.5">
          day streak
        </p>
      </div>
    </div>

    <!-- Section 2: e1RM explainer card -->
    <div class="rounded-lg bg-slate-800/50 border border-slate-700/50 overflow-hidden">
      <!-- Collapsible header -->
      <button
        class="w-full flex items-center gap-3 px-4 py-3 text-left border-l-2 border-violet-500"
        @click="e1rmInfoOpen = !e1rmInfoOpen"
      >
        <UIcon name="i-lucide-info" class="size-4 shrink-0 text-violet-400" />
        <span class="flex-1 text-sm font-medium text-white">What is e1RM?</span>
        <UIcon
          name="i-lucide-chevron-down"
          class="size-4 text-slate-400 transition-transform duration-200"
          :class="e1rmInfoOpen ? 'rotate-180' : ''"
        />
      </button>

      <!-- Expanded content -->
      <div v-if="e1rmInfoOpen" class="px-4 pb-4 space-y-3 text-sm text-slate-300">
        <p>
          Estimated 1-Rep Max (e1RM) is a way to estimate the maximum weight you could lift for a single rep, based on any set you actually performed.
        </p>
        <p>
          Formula: <code class="px-1.5 py-0.5 rounded bg-slate-700 text-violet-300 font-mono text-xs">e1RM = weight × (1 + reps ÷ 30)</code>
        </p>
        <p>
          This is the Epley formula — one of the most widely used estimates in strength training.
        </p>
        <p>
          <span class="font-medium text-white">Why it matters:</span> Your program uses different rep ranges across phases (e.g., 5×5 one month, 3×12 the next). Your average weight would drop as rep counts go up, even if you're getting stronger. e1RM normalizes this so your trend always reflects true progress.
        </p>
        <p class="text-slate-400">
          Note: Less accurate above ~15 reps; most meaningful for compound barbell movements.
        </p>
      </div>
    </div>

    <!-- Section 3: Exercise list -->
    <div>
      <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">
        Your Exercises
      </h3>

      <!-- Loading -->
      <div v-if="exercisesStatus === 'pending'" class="space-y-2">
        <div v-for="i in 3" :key="i" class="h-12 animate-pulse rounded-lg bg-slate-800" />
      </div>

      <!-- Error -->
      <UCard v-else-if="exercisesStatus === 'error'">
        <div class="text-center text-red-400">
          <p>Failed to load exercises.</p>
          <p class="mt-1 text-sm">
            Please try again later.
          </p>
        </div>
      </UCard>

      <!-- Empty -->
      <UCard v-else-if="exercises && exercises.length === 0">
        <div class="text-center text-slate-400">
          <p>No exercises tracked yet.</p>
          <p class="mt-1 text-sm">
            Complete some workouts to see your exercises here.
          </p>
        </div>
      </UCard>

      <!-- Exercise rows -->
      <div v-else-if="exercises" class="space-y-2">
        <button
          v-for="exercise in exercises"
          :key="exercise.id"
          class="w-full flex items-center justify-between rounded-lg px-4 py-3 text-left transition-colors"
          :class="selectedExerciseId === exercise.id
            ? 'border border-violet-500/50 bg-violet-500/10'
            : 'bg-slate-800/50 border border-slate-700/50'"
          @click="selectExercise(exercise.id)"
        >
          <span class="text-sm font-medium text-white">{{ exercise.name }}</span>
          <span class="text-xs text-slate-400">{{ exercise.sessionCount }} sessions</span>
        </button>
      </div>
    </div>

    <!-- Section 4: Exercise history detail -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div v-if="selectedExerciseId" class="space-y-3">
        <!-- Loading -->
        <div v-if="historyStatus === 'pending'" class="space-y-2">
          <div v-for="i in 3" :key="i" class="h-12 animate-pulse rounded-lg bg-slate-800" />
        </div>

        <template v-else-if="exerciseHistory">
          <!-- Section heading -->
          <h3 class="text-sm font-semibold text-white">
            {{ exerciseHistory.exercise.name }}
          </h3>

          <!-- Empty history -->
          <div
            v-if="exerciseHistory.history.length === 0"
            class="rounded-lg bg-slate-800/50 border border-slate-700/50 px-4 py-6 text-center"
          >
            <p class="text-sm text-slate-400">
              No completed sessions found for this exercise
            </p>
          </div>

          <template v-else>
            <!-- e1RM sparkline chart -->
            <div
              v-if="chartPoints.length > 0"
              class="rounded-lg bg-slate-800/50 border border-slate-700/50 px-4 py-3"
            >
              <p class="text-xs text-slate-400 mb-2">
                e1RM Trend
              </p>
              <div class="relative">
                <svg
                  viewBox="0 0 300 80"
                  width="100%"
                  height="80"
                  class="overflow-visible"
                >
                  <!-- Trend line -->
                  <polyline
                    v-if="sparklinePoints.length > 1"
                    :points="polylinePointsStr"
                    fill="none"
                    stroke="#8b5cf6"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />

                  <!-- Data points -->
                  <g
                    v-for="(pt, i) in sparklinePoints"
                    :key="i"
                    class="cursor-pointer"
                    @click="handleChartPointClick(i)"
                  >
                    <circle
                      :cx="pt.x"
                      :cy="pt.y"
                      r="4"
                      fill="#8b5cf6"
                      stroke="#1e1b4b"
                      stroke-width="2"
                    />
                    <!-- Larger invisible hit target -->
                    <circle
                      :cx="pt.x"
                      :cy="pt.y"
                      r="12"
                      fill="transparent"
                    />
                  </g>

                  <!-- Selected point label -->
                  <template v-if="selectedPoint !== null && sparklinePoints[selectedPoint]">
                    <text
                      :x="sparklinePoints[selectedPoint].x"
                      :y="sparklinePoints[selectedPoint].y - 12"
                      text-anchor="middle"
                      fill="#c4b5fd"
                      font-size="9"
                      font-weight="600"
                    >
                      {{ formatE1rm(sparklinePoints[selectedPoint].session.bestE1rm as number) }}
                    </text>
                    <text
                      :x="sparklinePoints[selectedPoint].x"
                      :y="sparklinePoints[selectedPoint].y - 22"
                      text-anchor="middle"
                      fill="#94a3b8"
                      font-size="8"
                    >
                      {{ formatSessionDate(sparklinePoints[selectedPoint].session.completedAt) }}
                    </text>
                  </template>
                </svg>
              </div>
            </div>

            <!-- Session list -->
            <div class="space-y-2">
              <div
                v-for="session in displayHistory"
                :key="session.sessionId"
                class="rounded-lg bg-slate-800/50 border border-slate-700/50 px-4 py-3"
              >
                <div class="flex items-start justify-between gap-2">
                  <p class="text-sm font-medium text-white">
                    {{ formatSessionDate(session.completedAt) }}
                  </p>
                  <span class="text-xs text-slate-400 shrink-0">
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
        </template>
      </div>
    </Transition>
  </div>
</template>
