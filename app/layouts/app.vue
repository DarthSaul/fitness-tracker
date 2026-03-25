/**
 * Shared authenticated app shell providing a fixed header, bottom navigation, and a centred main content slot.
 */
<script setup lang="ts">
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
      class="fixed top-0 right-0 left-0 z-10 flex items-center justify-between px-4 pb-3 transition-colors duration-300"
      :class="scrolled ? 'bg-slate-950/80 backdrop-blur-md' : ''"
      style="padding-top: calc(env(safe-area-inset-top) + 0.75rem)"
    >
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
    </header>

    <!-- Main content -->
    <main ref="mainEl" class="mx-auto w-full max-w-lg flex-1 overflow-y-auto px-4 pb-6" style="padding-top: calc(env(safe-area-inset-top) + 5rem)">
      <slot />
    </main>

    <!-- Bottom nav -->
    <nav class="z-10 mx-auto w-full shrink-0 max-w-lg px-4 pt-2" style="padding-bottom: calc(env(safe-area-inset-bottom) + 0.5rem)">
      <div class="flex items-center justify-around rounded-2xl bg-slate-800/90 p-2 backdrop-blur-md">
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
