/**
 * Shared authenticated app shell providing a fixed header, bottom navigation, and a centred main content slot.
 */
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const { user, signOut } = useAuth()
const route = useRoute()

/** Derives the single uppercase character shown in the avatar from the authenticated user's name. */
const userInitial = computed(() => {
  return user.value?.name?.charAt(0).toUpperCase() ?? '?'
})

const firstName = computed(() => {
  const name = user.value?.name?.trim()
  return name ? name.split(' ')[0] : 'there'
})

const dropdownItems: DropdownMenuItem[] = [
  {
    label: 'Sign out',
    icon: 'i-lucide-log-out',
    onSelect: () => signOut(),
  },
]

const navItems = [
  { label: 'Home', icon: '🏋️', to: '/app' },
  { label: 'Programs', icon: '📋', to: '/programs' },
  { label: 'Analytics', icon: '📊', to: '/analytics' },
  { label: 'Settings', icon: '⚙️', to: '/settings' },
]

/** Returns true when the given route path matches or is a child of the current route, used to highlight the active nav item. */
function isActive(to: string): boolean {
  if (!to) return false
  return route.path === to || route.path.startsWith(to + '/')
}

const scrolled = ref(false)

function onScroll(): void {
  scrolled.value = window.scrollY > 10
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <!-- Header -->
    <header
      class="fixed top-0 right-0 left-0 z-10 flex items-center justify-between px-4 py-3 transition-colors duration-300"
      :class="scrolled ? 'bg-slate-950/80 backdrop-blur-md' : ''"
    >
      <div>
        <h1 class="text-base font-semibold text-white">Hello, {{ firstName }} 👋</h1>
        <p class="text-xs text-slate-400">Let's get after it today.</p>
      </div>
      <UDropdownMenu :items="dropdownItems">
        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white cursor-pointer"
          aria-haspopup="menu"
          aria-label="User menu"
        >
          {{ userInitial }}
        </button>
      </UDropdownMenu>
    </header>

    <!-- Main content -->
    <main class="mx-auto w-full max-w-lg flex-1 px-4 pt-20 pb-24">
      <slot />
    </main>

    <!-- Bottom nav -->
    <nav class="fixed right-0 bottom-4 left-0 z-10 mx-auto w-full max-w-lg px-4">
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
  </div>
</template>
