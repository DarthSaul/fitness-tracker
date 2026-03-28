/**
 * Shared authenticated app shell providing a fixed header, bottom navigation, and a centred main content slot.
 */
<script setup lang="ts">
import type { ActiveWorkoutResponse } from '~/types/workout'

const { user } = useAuth()
const route = useRoute()

/** Derives the single uppercase character shown in the avatar from the authenticated user's name. */
const userInitial = computed(() => {
  return user.value?.name?.charAt(0).toUpperCase() ?? '?'
})

const firstName = computed(() => {
  const name = user.value?.name?.trim()
  return name ? name.split(' ')[0] : 'there'
})

const settingsOpen = ref(false)

const { data: activeWorkout } = useFetch<ActiveWorkoutResponse>('/api/workouts/active', {
  key: CACHE_KEYS.ACTIVE_WORKOUT,
  getCachedData: (key) => getCached<ActiveWorkoutResponse>(key),
  server: false,
})

const isOnWorkoutPage = computed(() => route.path.startsWith('/workout/'))
const showResumeChip = computed(() => !!activeWorkout.value?.session && !isOnWorkoutPage.value)

const navItems = [
  { label: 'Home', icon: '🏋️', to: '/' },
  { label: 'Programs', icon: '📋', to: '/programs' },
  { label: 'Analytics', icon: '📊', to: '/analytics' },
  { label: 'Feedback', icon: '💬', to: '/feedback' },
]

/** Returns true when the given route path matches or is a child of the current route, used to highlight the active nav item. */
function isActive(to: string): boolean {
  if (!to) return false
  return route.path === to || route.path.startsWith(to + '/')
}

const mainEl = ref<HTMLElement | null>(null)
const scrolled = ref(false)

function onScroll(): void {
  scrolled.value = (mainEl.value?.scrollTop ?? 0) > 10
}

onMounted(() => {
  mainEl.value?.addEventListener('scroll', onScroll, { passive: true })
})

onUnmounted(() => {
  mainEl.value?.removeEventListener('scroll', onScroll)
})
</script>

<template>
  <div class="fixed inset-0 flex flex-col overflow-hidden" style="background: radial-gradient(ellipse at 50% 40%, #1e0a3a 0%, #150525 25%, #0f172a 55%, #020617 100%)">
    <!-- Header -->
    <header
      class="fixed top-0 right-0 left-0 z-10 px-4 pb-3 transition-colors duration-300"
      :class="scrolled ? 'bg-slate-950/80 backdrop-blur-md' : ''"
      style="padding-top: calc(env(safe-area-inset-top) + 0.75rem)"
    >
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-base font-semibold text-white">Hello, {{ firstName }} 👋</h1>
          <p class="text-xs text-slate-400">Let's get after it today.</p>
        </div>
        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white cursor-pointer"
          aria-label="Open settings"
          @click="settingsOpen = true"
        >
          {{ userInitial }}
        </button>
      </div>
      <NuxtLink
        v-if="showResumeChip && activeWorkout?.session"
        :to="`/workout/${activeWorkout.session.id}`"
        class="mt-2 inline-flex items-center gap-1 rounded-md bg-emerald-600/20 px-2.5 py-1 text-sm font-medium text-emerald-400"
      >
        Resume workout
        <UIcon name="i-lucide-chevron-right" class="size-4" />
      </NuxtLink>
    </header>

    <!-- Main content -->
    <main
      ref="mainEl"
      class="mx-auto w-full max-w-lg flex-1 overflow-y-auto px-4"
      :style="{
        paddingTop: `calc(env(safe-area-inset-top) + ${showResumeChip ? '6.5' : '5'}rem)`,
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)',
      }"
    >
      <slot />
    </main>

    <!-- Bottom nav -->
    <nav
      class="fixed bottom-0 left-0 right-0 z-10 bg-slate-900/95 backdrop-blur-md"
      style="padding-bottom: env(safe-area-inset-bottom)"
    >
      <div class="mx-auto flex max-w-lg items-center justify-around px-4 py-2">
        <template v-for="item in navItems" :key="item.label">
          <NuxtLink
            v-if="item.to"
            :to="item.to"
            class="flex flex-col items-center rounded-2xl px-4 py-2.5 transition-colors"
            :class="isActive(item.to) ? 'bg-slate-700/50' : ''"
          >
            <span class="text-lg leading-none">{{ item.icon }}</span>
            <span
              class="text-xs"
              :class="isActive(item.to) ? 'text-violet-400' : 'text-slate-400'"
            >
              {{ item.label }}
            </span>
          </NuxtLink>
          <div v-else class="flex flex-col items-center rounded-2xl px-4 py-2.5">
            <span class="text-lg leading-none">{{ item.icon }}</span>
            <span class="text-xs text-slate-400">{{ item.label }}</span>
          </div>
        </template>
      </div>
    </nav>

    <PwaInstallBanner />
    <SettingsDrawer v-model:open="settingsOpen" />
  </div>
</template>
