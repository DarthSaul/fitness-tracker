<script setup lang="ts">
definePageMeta({ layout: 'default' })

const route = useRoute()

const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const success = ref(false)
const errorMessage = ref<string | null>(null)

const accessToken = computed(() => route.query.access_token as string | undefined)
const refreshToken = computed(() => route.query.refresh_token as string | undefined)

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
        <h1 class="text-2xl font-bold tracking-tight text-white">
          Reset Password
        </h1>
        <p class="mt-2 text-sm text-slate-400">
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

      <template v-else-if="!hasTokens">
        <UAlert
          color="error"
          variant="subtle"
          title="Invalid or expired reset link. Please request a new one."
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

        <div class="rounded-xl bg-slate-900 p-6">
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
