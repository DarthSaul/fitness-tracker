<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

definePageMeta({ layout: 'default' })

const { user, signOut } = useAuth()

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
      <div class="space-y-6">
        <div>
          <h2 class="text-lg font-semibold text-white">
            Welcome, {{ user?.name ?? 'there' }}
          </h2>
        </div>

        <UCard>
          <div class="text-center text-slate-400">
            <p>No active programs yet.</p>
            <p class="mt-1 text-sm">
              Browse programs to get started.
            </p>
          </div>
        </UCard>
      </div>
    </main>

    <!-- Bottom nav -->
    <nav class="fixed right-0 bottom-0 left-0 z-10 flex items-center justify-around bg-slate-800 px-4 py-3">
      <div class="flex flex-col items-center gap-1">
        <span class="text-xl">🏋️</span>
        <span class="text-xs text-slate-300">Workout</span>
      </div>
      <div class="flex flex-col items-center gap-1">
        <span class="text-xl">📊</span>
        <span class="text-xs text-slate-300">Progress</span>
      </div>
      <div class="flex flex-col items-center gap-1">
        <span class="text-xl">⚙️</span>
        <span class="text-xs text-slate-300">Settings</span>
      </div>
    </nav>
  </div>
</template>
