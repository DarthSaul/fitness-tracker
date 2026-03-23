<script setup lang="ts">
definePageMeta({ layout: 'default' })

const route = useRoute()
const status = ref<'verifying' | 'success' | 'error'>('verifying')
const errorMessage = ref<string | null>(null)

onMounted(async () => {
  // Supabase email confirmation redirects with tokens in the URL hash fragment
  // Format: #access_token=...&refresh_token=...&type=signup
  const hash = window.location.hash.substring(1)
  const params = new URLSearchParams(hash)
  const type = params.get('type') || route.query.type

  if (type === 'signup' || type === 'email') {
    status.value = 'success'
    // Redirect to login with confirmation success after a short delay
    setTimeout(() => {
      navigateTo('/login?confirmed=true')
    }, 2000)
  }
  else if (type === 'recovery') {
    // Password recovery — redirect to reset password page with tokens
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    if (accessToken && refreshToken) {
      await navigateTo({
        path: '/auth/reset-password',
        query: { access_token: accessToken, refresh_token: refreshToken },
      })
    }
    else {
      status.value = 'error'
      errorMessage.value = 'Invalid reset link. Please request a new one.'
    }
  }
  else {
    status.value = 'error'
    errorMessage.value = 'Invalid confirmation link.'
  }
})
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center px-4">
    <div class="w-full max-w-sm space-y-6 text-center">
      <template v-if="status === 'verifying'">
        <div class="h-8 w-8 mx-auto animate-spin rounded-full border-2 border-slate-600 border-t-primary-400" />
        <p class="text-slate-400">
          Verifying your email...
        </p>
      </template>

      <template v-else-if="status === 'success'">
        <UAlert
          color="success"
          variant="subtle"
          title="Email confirmed! Redirecting to sign in..."
          icon="i-lucide-check-circle"
        />
      </template>

      <template v-else>
        <UAlert
          color="error"
          variant="subtle"
          :title="errorMessage ?? 'Something went wrong.'"
          icon="i-lucide-alert-circle"
        />
        <UButton
          to="/login"
          color="primary"
          variant="outline"
          label="Back to Login"
        />
      </template>
    </div>
  </div>
</template>
