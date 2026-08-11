/**
 * Authenticated app shell: a scrolling content column with per-page chrome, a
 * floating "workout in progress" banner, and the five-item tab bar.
 *
 * Mirrors `RootTabView` on iOS — each screen declares its own header through
 * `definePageMeta({ header: … })` rather than the shell hardcoding one.
 */
<script setup lang="ts">
import type { ActiveWorkoutResponse } from '~/types/workout'
import type { ActiveStandaloneSession } from '~/types/standalone'

const route = useRoute()
const router = useRouter()

const { data: activeWorkout } = useFetch<ActiveWorkoutResponse>('/api/workouts/active', {
  key: CACHE_KEYS.ACTIVE_WORKOUT,
  getCachedData: (key) => getCached<ActiveWorkoutResponse>(key),
  server: false,
})

const { data: activeStandalone } = useFetch<{ sessions: ActiveStandaloneSession[] }>(
  '/api/standalone-workout-sessions/active',
  { server: false },
)

// Pages whose title depends on fetched data publish an override; everything
// else declares a static header in definePageMeta.
const headerOverride = usePageHeaderOverride()
const header = computed(() => headerOverride.value ?? route.meta.header)
const isInlineHeader = computed(() => header.value?.style === 'inline')

const isOnWorkoutPage = computed(() =>
  route.path.startsWith('/workout/') || route.path.startsWith('/standalone-workouts/session/'),
)

/**
 * Either kind of session can be in flight. A program workout wins if both
 * exist — it's the one tied to the user's schedule.
 */
const resumeTarget = computed(() => {
  const program = activeWorkout.value?.session
  if (program) {
    return {
      to: `/workout/${program.id}`,
      subtitle: `Week ${program.weekNumber} · Day ${program.dayNumber}`,
    }
  }
  const standalone = activeStandalone.value?.sessions?.[0]
  if (standalone) {
    return {
      to: `/standalone-workouts/session/${standalone.id}`,
      subtitle: standalone.standaloneWorkout.name,
    }
  }
  return null
})

const showResumeBanner = computed(() => !!resumeTarget.value && !isOnWorkoutPage.value)

const mainEl = ref<HTMLElement | null>(null)
const scrolled = ref(false)

/** 24px matches `ScrollingTitleChrome.chipThreshold` on iOS. */
function onScroll(): void {
  scrolled.value = (mainEl.value?.scrollTop ?? 0) > 24
}

onMounted(() => {
  mainEl.value?.addEventListener('scroll', onScroll, { passive: true })
})

/**
 * `<main>` is the scroll container and it persists across navigations, so
 * without this a new screen opens at the previous screen's scroll offset with
 * the previous screen's title still floating in the chip.
 */
watch(() => route.fullPath, () => {
  if (mainEl.value) mainEl.value.scrollTop = 0
  scrolled.value = false
})

onUnmounted(() => {
  mainEl.value?.removeEventListener('scroll', onScroll)
})
</script>

<template>
  <div class="fixed inset-0 flex flex-col overflow-hidden bg-canvas" style="height: 100dvh">
    <!-- Compact bar for pushed screens -->
    <header
      v-if="isInlineHeader"
      class="shrink-0 border-b border-separator bg-canvas/80 backdrop-blur-xl"
      style="padding-top: env(safe-area-inset-top)"
    >
      <div class="relative mx-auto flex h-11 w-full max-w-lg items-center px-2">
        <button
          type="button"
          class="flex items-center gap-0.5 rounded-chip px-1 py-1 text-body text-tint"
          @click="router.back()"
        >
          <UIcon name="i-lucide-chevron-left" class="size-5" />
          Back
        </button>
        <h1 class="absolute left-1/2 -translate-x-1/2 text-headline">{{ header?.title }}</h1>
      </div>
    </header>

    <div class="relative flex min-h-0 flex-1 flex-col">
      <main
        ref="mainEl"
        class="mx-auto w-full max-w-lg flex-1 overflow-y-auto"
        :style="{ paddingTop: isInlineHeader ? '0' : 'env(safe-area-inset-top)' }"
      >
        <AppScreenHeader
          v-if="header && !isInlineHeader"
          :title="header.title"
          :emoji="header.emoji"
          :subtitle="header.subtitle"
        />
        <div class="px-4 pt-3 pb-6">
          <slot />
        </div>
      </main>

      <!--
        Progressive blur into the status bar, the CSS analogue of iOS's
        VariableBlur: a blurred strip masked to fade out downwards.
      -->
      <div
        v-if="!isInlineHeader"
        class="pointer-events-none absolute inset-x-0 top-0 backdrop-blur-md [mask-image:linear-gradient(to_bottom,black,transparent)]"
        style="height: calc(env(safe-area-inset-top) + 1.25rem)"
      />

      <!-- Floating title chip, once the large header has scrolled away -->
      <Transition
        enter-active-class="transition duration-200 ease-snappy"
        enter-from-class="scale-90 opacity-0"
        leave-active-class="transition duration-200 ease-snappy"
        leave-to-class="scale-90 opacity-0"
      >
        <div
          v-if="scrolled && header && !isInlineHeader"
          class="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 rounded-full bg-material px-3 py-1.5 text-footnote font-semibold shadow-chip backdrop-blur-2xl backdrop-saturate-150"
          style="top: calc(env(safe-area-inset-top) + 0.25rem)"
        >
          {{ header.title }}
        </div>
      </Transition>
    </div>

    <div class="relative shrink-0">
      <ShellResumeBanner
        v-if="showResumeBanner && resumeTarget"
        :to="resumeTarget.to"
        :subtitle="resumeTarget.subtitle"
        variant="floating"
      />
      <ShellTabBar />
    </div>

    <PwaInstallBanner />
  </div>
</template>
