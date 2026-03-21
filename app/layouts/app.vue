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
  { label: 'Settings', icon: '⚙️', to: '' },
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
    <header class="fixed top-0 right-0 left-0 z-10 flex items-center justify-between bg-slate-800 px-4 py-3">
      <div class="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">
        {{ userInitial }}
      </div>
      <span class="text-base font-semibold text-white">Workout App</span>
      <UDropdownMenu :items="dropdownItems">
        <UButton
          icon="i-lucide-ellipsis-vertical"
          color="neutral"
          variant="ghost"
          size="sm"
        />
      </UDropdownMenu>
    </header>

    <!-- Main content -->
    <main class="mx-auto w-full max-w-lg flex-1 px-4 pt-20 pb-24">
      <slot />
    </main>

    <!-- Bottom nav -->
    <nav class="fixed right-0 bottom-0 left-0 z-10 flex items-center justify-around bg-slate-800 px-4 py-3">
      <template v-for="item in navItems" :key="item.label">
        <NuxtLink
          v-if="item.to"
          :to="item.to"
          class="flex flex-col items-center gap-1"
        >
          <span class="text-xl">{{ item.icon }}</span>
          <span
            class="text-xs"
            :class="isActive(item.to) ? 'text-violet-400' : 'text-slate-400'"
          >
            {{ item.label }}
          </span>
        </NuxtLink>
        <div v-else class="flex flex-col items-center gap-1">
          <span class="text-xl">{{ item.icon }}</span>
          <span class="text-xs text-slate-400">{{ item.label }}</span>
        </div>
      </template>
    </nav>
  </div>
</template>
