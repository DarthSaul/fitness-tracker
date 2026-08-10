<script setup lang="ts">
/**
 * Analytics page — strength progress dashboard with e1RM sparklines per exercise.
 */
definePageMeta({
  layout: 'app',
  header: { title: 'Analytics', emoji: '📈', subtitle: 'Strength progress' },
})

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

// --- Sparkline chart (geometry shared with WorkoutExerciseTrendDrawer) ---

const selectedPoint = ref<number | null>(null)

const sparklinePoints = computed(() => buildSparkline(exerciseHistory.value?.history ?? []))

const polylinePointsStr = computed(() => toPolylinePoints(sparklinePoints.value))

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

// --- Exercise selector handlers ---

function handleExerciseChange(id: string | null) {
  if (id) selectExercise(id)
}

function handleExerciseClear() {
  if (selectedExerciseId.value) selectExercise(selectedExerciseId.value)
}
</script>

<template>
  <div class="space-y-6">
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

      <!-- Sessions This Week -->
      <div class="rounded-lg bg-slate-800/50 border border-slate-700/50 px-3 py-2.5">
        <UIcon name="i-lucide-calendar-days" class="size-4 text-violet-400 mb-1" />
        <p class="text-lg font-semibold text-white leading-none">
          {{ dashboard.sessionsThisWeek }}
        </p>
        <p class="text-xs text-slate-400 mt-0.5">
          this week
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

    <!-- Section 3: Exercise selector -->
    <div>
      <h3 class="text-sm text-slate-500 mb-3">
        Exercise
      </h3>

      <!-- Loading skeleton -->
      <div v-if="exercisesStatus === 'pending'" class="h-10 animate-pulse rounded-lg bg-slate-800" />

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

      <!-- Searchable dropdown -->
      <USelectMenu
        v-else-if="exercises"
        :model-value="selectedExerciseId"
        :items="exercises"
        value-key="id"
        label-key="name"
        :search-input="{ placeholder: 'Search exercises…' }"
        placeholder="Choose an exercise…"
        :clear="true"
        size="lg"
        class="w-full"
        @update:model-value="handleExerciseChange"
        @clear="handleExerciseClear"
      >
        <template #item-trailing="{ item: exercise }">
          <span class="text-xs text-slate-400">{{ (exercise as any).sessionCount }} sessions</span>
        </template>
      </USelectMenu>
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
      <!-- Ghost placeholder when no exercise is selected (only when exercises exist) -->
      <div v-if="!selectedExerciseId && exercises && exercises.length > 0" class="space-y-3">
        <div class="rounded-lg border border-slate-700/20 bg-slate-800/20 px-4 py-3">
          <p class="mb-2 text-xs text-slate-400">
            e1RM Trend
          </p>
          <div class="h-20 rounded bg-slate-700/20" />
        </div>
        <div v-for="i in 3" :key="i" class="rounded-lg border border-slate-700/20 bg-slate-800/20 px-4 py-3">
          <div class="h-2.5 w-28 rounded-full bg-slate-700/30" />
          <div class="mt-2.5 h-2.5 w-20 rounded-full bg-slate-700/20" />
        </div>
      </div>

      <div v-else class="space-y-3">
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
              v-if="sparklinePoints.length > 0"
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
                      :x="sparklinePoints[selectedPoint]!.x"
                      :y="sparklinePoints[selectedPoint]!.y - 12"
                      text-anchor="middle"
                      fill="#c4b5fd"
                      font-size="9"
                      font-weight="600"
                    >
                      {{ formatE1rm(sparklinePoints[selectedPoint]!.session.bestE1rm as number) }}
                    </text>
                    <text
                      :x="sparklinePoints[selectedPoint]!.x"
                      :y="sparklinePoints[selectedPoint]!.y - 22"
                      text-anchor="middle"
                      fill="#94a3b8"
                      font-size="8"
                    >
                      {{ formatSessionDate(sparklinePoints[selectedPoint]!.session.completedAt) }}
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
