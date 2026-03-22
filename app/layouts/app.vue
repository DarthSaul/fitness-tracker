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
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <!-- Header -->
    <header class="fixed top-0 right-0 left-0 z-10 flex items-center justify-start gap-4 px-4 py-3">
      <UDropdownMenu :items="dropdownItems">
        <div class="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white cursor-pointer">
          {{ userInitial }}
        </div>
      </UDropdownMenu>
      <span class="text-base font-semibold text-white">Welcome, {{ user?.name?.split(' ')[0] ?? 'there' }}</span>
    </header>

    <!-- Main content -->
    <main class="mx-auto w-full max-w-lg flex-1 px-4 pt-20 pb-24">
      <slot />
    </main>

    <!-- Bottom nav -->
    <nav class="fixed right-6 bottom-4 left-6 z-10 flex items-center justify-around rounded-2xl bg-slate-800/90 p-2 backdrop-blur-md">
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
    </nav>
  </div>
</template>
