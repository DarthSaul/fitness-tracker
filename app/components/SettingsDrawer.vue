/**
 * Full-screen settings panel that slides in from the right.
 * Contains user profile display and grouped settings rows (mostly stubs).
 */
<script setup lang="ts">
import { VisuallyHidden, DialogTitle, DialogDescription } from 'reka-ui'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const { user, signOut } = useAuth()

const userInitial = computed(() => user.value?.name?.charAt(0).toUpperCase() ?? '?')

async function handleSignOut(): Promise<void> {
  emit('update:open', false)
  await signOut()
}
</script>

<template>
  <USlideover
    :open="props.open"
    :ui="{ content: 'bg-slate-950', header: 'px-4', body: 'p-0' }"
    @update:open="emit('update:open', $event)"
  >
    <template #header>
      <VisuallyHidden>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>Manage your account settings and preferences</DialogDescription>
      </VisuallyHidden>
      <button
        type="button"
        class="flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white"
        @click="emit('update:open', false)"
      >
        <UIcon name="i-lucide-arrow-left" class="size-4" />
        Back
      </button>
    </template>

    <template #body>
      <div class="flex h-full flex-col overflow-y-auto pb-8">

        <!-- User profile -->
        <div class="flex flex-col items-center px-6 pb-8 pt-6">
          <div class="flex h-20 w-20 items-center justify-center rounded-full bg-violet-600 text-2xl font-bold text-white">
            {{ userInitial }}
          </div>
          <p class="mt-4 text-lg font-semibold text-white">
            {{ user?.name ?? 'Unknown' }}
          </p>
          <p class="mt-0.5 text-sm text-slate-400">
            {{ user?.email ?? '' }}
          </p>
        </div>

        <!-- Settings sections -->
        <div class="space-y-6 px-4">

          <!-- Account -->
          <div>
            <p class="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Account</p>
            <div class="divide-y divide-slate-800/60">
              <button class="flex w-full items-center justify-between py-3 px-1 text-left">
                <span class="text-sm text-white">Edit Profile</span>
                <UIcon name="i-lucide-chevron-right" class="size-4 text-slate-500" />
              </button>
              <button class="flex w-full items-center justify-between py-3 px-1 text-left">
                <span class="text-sm text-white">Change Password</span>
                <UIcon name="i-lucide-chevron-right" class="size-4 text-slate-500" />
              </button>
              <button class="flex w-full items-center justify-between py-3 px-1 text-left">
                <span class="text-sm text-white">Connected Accounts</span>
                <UIcon name="i-lucide-chevron-right" class="size-4 text-slate-500" />
              </button>
            </div>
          </div>

          <!-- Preferences -->
          <div>
            <p class="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Preferences</p>
            <div class="divide-y divide-slate-800/60">
              <button class="flex w-full items-center justify-between py-3 px-1 text-left">
                <span class="text-sm text-white">Units</span>
                <span class="flex items-center gap-1 text-sm text-slate-400">
                  lbs <UIcon name="i-lucide-chevron-right" class="size-4 text-slate-500" />
                </span>
              </button>
              <button class="flex w-full items-center justify-between py-3 px-1 text-left">
                <span class="text-sm text-white">Notifications</span>
                <span class="flex items-center gap-1 text-sm text-slate-400">
                  On <UIcon name="i-lucide-chevron-right" class="size-4 text-slate-500" />
                </span>
              </button>
              <button class="flex w-full items-center justify-between py-3 px-1 text-left">
                <span class="text-sm text-white">Theme</span>
                <span class="flex items-center gap-1 text-sm text-slate-400">
                  Dark <UIcon name="i-lucide-chevron-right" class="size-4 text-slate-500" />
                </span>
              </button>
            </div>
          </div>

          <!-- About -->
          <div>
            <p class="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">About</p>
            <div class="divide-y divide-slate-800/60">
              <div class="flex items-center justify-between py-3 px-1">
                <span class="text-sm text-white">Version</span>
                <span class="text-sm text-slate-400">0.1.0</span>
              </div>
              <button class="flex w-full items-center justify-between py-3 px-1 text-left">
                <span class="text-sm text-white">Privacy Policy</span>
                <UIcon name="i-lucide-chevron-right" class="size-4 text-slate-500" />
              </button>
              <button class="flex w-full items-center justify-between py-3 px-1 text-left">
                <span class="text-sm text-white">Terms of Service</span>
                <UIcon name="i-lucide-chevron-right" class="size-4 text-slate-500" />
              </button>
            </div>
          </div>

          <!-- Sign out -->
          <button
            type="button"
            class="w-full rounded-xl bg-red-950/40 px-4 py-3 text-sm font-medium text-red-400 transition-colors hover:bg-red-950/60 active:bg-red-950/80"
            @click="handleSignOut"
          >
            Sign Out
          </button>

        </div>
      </div>
    </template>
  </USlideover>
</template>
