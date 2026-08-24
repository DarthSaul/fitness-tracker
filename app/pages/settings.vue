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

const { user, signOut, deleteAccount } = useAuth()
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

// Deletion is irreversible, so the row only opens a confirmation sheet; the
// actual DELETE happens on the sheet's destructive button. On success,
// deleteAccount() navigates away to `/`. Required by App Review 5.1.1(v).
const deleteSheetOpen = ref(false)
const deleting = ref(false)
const deleteError = ref<string | null>(null)

function openDeleteSheet(): void {
  deleteError.value = null
  deleteSheetOpen.value = true
}

async function handleDeleteAccount(): Promise<void> {
  deleting.value = true
  deleteError.value = null
  try {
    await deleteAccount()
  } catch {
    // Keep the sheet open with an explanation so the user can retry. Deletion
    // may have partly completed on the server (external auth cleanup is not
    // rolled back), but retrying resumes and finishes it — so "try again" is
    // always the right guidance.
    deleteError.value = 'Could not delete your account. Please try again.'
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Profile. On desktop, Sign Out sits opposite the user info in this row;
         on the phone it stays at the bottom of the page (see below), so the
         button exists twice with breakpoint-gated visibility. -->
    <div class="flex items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-3">
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
      <UButton
        color="error"
        variant="soft"
        class="hidden shrink-0 lg:inline-flex"
        :loading="signingOut"
        :label="signingOut ? 'Signing out…' : 'Sign Out'"
        @click="handleSignOut"
      />
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

    <!-- Account -->
    <section>
      <p class="mb-1.5 px-1 text-caption font-semibold uppercase text-label-secondary">Account</p>
      <div class="overflow-hidden rounded-card bg-surface">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          @click="openDeleteSheet"
        >
          <span class="flex items-center gap-2.5 text-body text-ios-red">
            <UIcon name="i-lucide-trash-2" class="size-5" />
            Delete Account
          </span>
          <UIcon name="i-lucide-chevron-right" class="size-4 text-label-tertiary" />
        </button>
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
        class="lg:hidden"
        :loading="signingOut"
        :label="signingOut ? 'Signing out…' : 'Sign Out'"
        @click="handleSignOut"
      />
    </div>

    <AppSheet
      v-model:open="deleteSheetOpen"
      title="Delete Account?"
      description="Confirm permanent deletion of your account and all data"
    >
      <div class="space-y-3">
        <p class="text-body text-label-secondary">
          This permanently deletes your account and everything in it — saved
          programs, workout history, logged sets, notes, and PT routines. This
          cannot be undone.
        </p>
        <UAlert
          v-if="deleteError"
          color="error"
          variant="subtle"
          :title="deleteError"
          icon="i-lucide-alert-circle"
        />
      </div>

      <template #footer>
        <div class="space-y-2">
          <UButton
            block
            color="error"
            size="lg"
            :loading="deleting"
            :label="deleting ? 'Deleting…' : 'Delete My Account'"
            @click="handleDeleteAccount"
          />
          <UButton
            block
            color="neutral"
            variant="soft"
            size="lg"
            label="Cancel"
            :disabled="deleting"
            @click="deleteSheetOpen = false"
          />
        </div>
      </template>
    </AppSheet>
  </div>
</template>
