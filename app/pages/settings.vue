/**
 * Settings tab — profile, preferences, and sign-out.
 *
 * Replaces the right-hand slideover the avatar button used to open. Mirrors
 * `SettingsView.swift`, including Feedback living here rather than in the tab
 * bar.
 */
<script setup lang="ts">
definePageMeta({
  layout: 'app',
  header: { title: 'Settings', emoji: '⚙️' },
})

const { user, signOut } = useAuth()
const config = useRuntimeConfig()

const {
  enabled: ptEnabled,
  saving: ptSaving,
  status: ptStatus,
  setEnabled: setPtEnabled,
} = usePtRoutineSetting()

const userInitial = computed(() => user.value?.name?.charAt(0).toUpperCase() ?? '?')

const signingOut = ref(false)
const signOutError = ref<string | null>(null)

async function handleSignOut(): Promise<void> {
  signingOut.value = true
  signOutError.value = null
  try {
    await signOut()
  } catch {
    // Otherwise the button just stops spinning and the user is still signed in
    // with no explanation.
    signOutError.value = 'Could not sign out. Please try again.'
  } finally {
    signingOut.value = false
  }
}

async function handlePtToggle(value: boolean): Promise<void> {
  try {
    await setPtEnabled(value)
  } catch {
    // The switch is bound to the fetched profile, so a failed save reverts
    // visually on the next render.
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Profile -->
    <div class="flex items-center gap-3">
      <span
        class="flex size-11 shrink-0 items-center justify-center rounded-full bg-ios-purple/15 text-headline font-semibold text-ios-purple"
      >
        {{ userInitial }}
      </span>
      <span class="min-w-0">
        <span class="block text-title3 font-semibold">{{ user?.name ?? 'Unknown' }}</span>
        <span class="block truncate text-subheadline text-label-secondary">{{ user?.email ?? '' }}</span>
      </span>
    </div>

    <!-- Preferences -->
    <section>
      <p class="mb-1.5 px-1 text-caption font-semibold uppercase text-label-secondary">Preferences</p>
      <div class="divide-y divide-separator overflow-hidden rounded-card bg-surface">
        <div class="flex items-center justify-between gap-3 px-4 py-3">
          <span class="flex items-center gap-2.5 text-body">
            <UIcon name="i-lucide-contrast" class="size-5 text-tint" />
            Appearance
          </span>
          <UColorModeSelect />
        </div>

        <NuxtLink to="/feedback" class="flex items-center justify-between gap-3 px-4 py-3">
          <span class="flex items-center gap-2.5 text-body">
            <UIcon name="i-lucide-message-square" class="size-5 text-tint" />
            Feedback
          </span>
          <UIcon name="i-lucide-chevron-right" class="size-4 text-label-tertiary" />
        </NuxtLink>

        <div class="flex items-center justify-between gap-3 px-4 py-3">
          <span class="flex items-center gap-2.5 text-body">
            <UIcon name="i-lucide-activity" class="size-5 text-tint" />
            PT routine in workout
          </span>
          <AppSkeleton v-if="ptStatus === 'pending'" :height="20" :width="36" radius="chip" />
          <USwitch
            v-else
            :model-value="ptEnabled"
            :disabled="ptSaving"
            aria-label="PT routine in workout"
            @update:model-value="handlePtToggle"
          />
        </div>

        <NuxtLink to="/pt-routines" class="flex items-center justify-between gap-3 px-4 py-3">
          <span class="flex items-center gap-2.5 text-body">
            <UIcon name="i-lucide-list-checks" class="size-5 text-tint" />
            Manage PT routines
          </span>
          <UIcon name="i-lucide-chevron-right" class="size-4 text-label-tertiary" />
        </NuxtLink>
      </div>
    </section>

    <!-- About -->
    <section>
      <p class="mb-1.5 px-1 text-caption font-semibold uppercase text-label-secondary">About</p>
      <div class="divide-y divide-separator overflow-hidden rounded-card bg-surface">
        <div class="flex items-center justify-between gap-3 px-4 py-3">
          <span class="text-body">Version</span>
          <span class="text-body tnum text-label-secondary">{{ config.public.appVersion }}</span>
        </div>
      </div>
    </section>

    <div class="space-y-2">
      <UAlert
        v-if="signOutError"
        color="error"
        variant="subtle"
        :title="signOutError"
        icon="i-lucide-alert-circle"
      />
      <UButton
        block
        color="error"
        variant="soft"
        size="lg"
        :loading="signingOut"
        :label="signingOut ? 'Signing out…' : 'Sign Out'"
        @click="handleSignOut"
      />
    </div>
  </div>
</template>
