<script setup lang="ts">
definePageMeta({ layout: 'default' })

const route = useRoute()

const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const success = ref(false)
const errorMessage = ref<string | null>(null)

// Recovery tokens arrive two ways: in the query string when /auth/confirm
// forwards a recovery link that landed there (Site URL fallback), and in the
// URL hash fragment when the reset email's redirectTo points here directly —
// Supabase's implicit flow appends `#access_token=...&type=recovery`, which
// only the browser ever sees. Parsed on mount because the hash never reaches
// the server.
const accessToken = ref<string | null>(null)
const refreshToken = ref<string | null>(null)
const linkError = ref<string | null>(null)
const ready = ref(false)

onMounted(() => {
  const hash = new URLSearchParams(window.location.hash.substring(1))

  // Expired/used links redirect with an error hash instead of tokens:
  // #error=access_denied&error_code=otp_expired&error_description=...
  if (hash.get('error') || hash.get('error_description')) {
    linkError.value = hash.get('error_description') || 'This reset link is invalid or has expired.'
  }

  accessToken.value = (typeof route.query.access_token === 'string' ? route.query.access_token : null)
    || hash.get('access_token')
  refreshToken.value = (typeof route.query.refresh_token === 'string' ? route.query.refresh_token : null)
    || hash.get('refresh_token')
  ready.value = true
})

const hasTokens = computed(() => !!accessToken.value && !!refreshToken.value)

async function handleSubmit() {
  errorMessage.value = null

  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = 'Passwords do not match.'
    return
  }

  if (newPassword.value.length < 8) {
    errorMessage.value = 'Password must be at least 8 characters.'
    return
  }

  loading.value = true

  try {
    await $fetch('/api/auth/email/update-password', {
      method: 'POST',
      body: {
        accessToken: accessToken.value,
        refreshToken: refreshToken.value,
        newPassword: newPassword.value,
      },
    })

    success.value = true
  }
  catch (err: unknown) {
    const fetchErr = err as { data?: { message?: string }, statusMessage?: string }
    errorMessage.value = fetchErr.data?.message || fetchErr.statusMessage || 'Failed to update password. Please try again.'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center px-4">
    <div class="w-full max-w-sm space-y-6">
      <div class="text-center">
        <h1 class="text-2xl font-bold tracking-tight text-label">
          Reset Password
        </h1>
        <p class="mt-2 text-sm text-label-secondary">
          Enter your new password below
        </p>
      </div>

      <template v-if="success">
        <UAlert
          color="success"
          variant="subtle"
          title="Password updated successfully!"
          icon="i-lucide-check-circle"
        />
        <UButton
          to="/login"
          block
          size="lg"
          color="primary"
          label="Sign In"
        />
      </template>

      <!-- Hash parsing happens on mount; don't flash the error state before it runs. -->
      <template v-else-if="!ready">
        <div class="h-8 w-8 mx-auto animate-spin rounded-full border-2 border-separator border-t-tint" />
      </template>

      <template v-else-if="linkError || !hasTokens">
        <UAlert
          color="error"
          variant="subtle"
          :title="linkError ?? 'Invalid or expired reset link. Please request a new one.'"
          icon="i-lucide-alert-circle"
        />
        <UButton
          to="/login"
          block
          size="lg"
          color="primary"
          variant="outline"
          label="Back to Login"
        />
      </template>

      <template v-else>
        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          :title="errorMessage"
          icon="i-lucide-alert-circle"
        />

        <div class="rounded-card bg-canvas p-6">
          <form @submit.prevent="handleSubmit" class="space-y-3">
            <UInput
              v-model="newPassword"
              type="password"
              placeholder="New password"
              size="lg"
              icon="i-lucide-lock"
              required
              minlength="8"
              autocomplete="new-password"
            />

            <UInput
              v-model="confirmPassword"
              type="password"
              placeholder="Confirm new password"
              size="lg"
              icon="i-lucide-lock"
              required
              minlength="8"
              autocomplete="new-password"
            />

            <UButton
              type="submit"
              block
              size="lg"
              color="primary"
              :loading="loading"
              label="Update Password"
            />
          </form>
        </div>
      </template>
    </div>
  </div>
</template>
