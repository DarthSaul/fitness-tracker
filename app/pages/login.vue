<script setup lang="ts">
definePageMeta({ layout: 'default' })

const route = useRoute()
const { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } = useAuth()

type AuthMode = 'signin' | 'signup' | 'reset'
const mode = ref<AuthMode>('signin')

const email = ref('')
const password = ref('')
const name = ref('')
const loading = ref(false)
const successMessage = ref<string | null>(null)
const formError = ref<string | null>(null)

const errorMessages: Record<string, string> = {
  google_failed: 'Google sign-in failed. Please try again.',
  apple_failed: 'Apple sign-in failed. Please try again.',
  apple_no_email: 'Apple sign-in did not provide an email address.',
  upsert: 'Account setup failed. Please try again.',
  email_confirmed: undefined as unknown as string,
}

const errorParam = computed(() => {
  const err = route.query.error
  return typeof err === 'string' ? err : null
})

const errorMessage = computed(() => {
  if (formError.value) return formError.value
  if (!errorParam.value) return null
  return errorMessages[errorParam.value] ?? 'An unexpected error occurred.'
})

// Check for confirmation success from query param
if (route.query.confirmed === 'true') {
  successMessage.value = 'Email confirmed! You can now sign in.'
}

function switchMode(newMode: AuthMode) {
  mode.value = newMode
  formError.value = null
  successMessage.value = null
}

async function handleEmailSubmit() {
  formError.value = null
  successMessage.value = null
  loading.value = true

  try {
    if (mode.value === 'reset') {
      await resetPassword(email.value)
      successMessage.value = 'If an account exists with that email, a reset link has been sent.'
    }
    else if (mode.value === 'signup') {
      const result = await signUpWithEmail(email.value, password.value, name.value || undefined)
      if (result.confirmationRequired) {
        successMessage.value = 'Check your email to confirm your account before signing in.'
        switchMode('signin')
        // Preserve the success message after mode switch
        successMessage.value = 'Check your email to confirm your account before signing in.'
      }
      else {
        await navigateTo('/app')
      }
    }
    else {
      await signInWithEmail(email.value, password.value)
      await navigateTo('/app')
    }
  }
  catch (err: unknown) {
    const fetchErr = err as { data?: { message?: string }, statusMessage?: string }
    formError.value = fetchErr.data?.message || fetchErr.statusMessage || 'Something went wrong. Please try again.'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-dvh flex-col items-center justify-start px-4 pt-24">
    <div class="w-full max-w-md space-y-10">
      <div>
        <h1 class="text-4xl font-bold tracking-tight text-white">
          💪 Fitness Tracker
        </h1>
        <p class="mt-2 text-base text-slate-400">
          Track your structured workout programs
        </p>
      </div>

      <UAlert
        v-if="errorMessage"
        color="error"
        variant="subtle"
        :title="errorMessage"
        icon="i-lucide-alert-circle"
      />

      <UAlert
        v-if="successMessage"
        color="success"
        variant="subtle"
        :title="successMessage"
        icon="i-lucide-check-circle"
      />

      <div class="space-y-5">
        <!-- Email/Password Form -->
        <form @submit.prevent="handleEmailSubmit" class="space-y-4">
          <div v-if="mode === 'signup'">
            <label class="mb-1.5 block text-sm font-medium text-slate-300">Name (optional)</label>
            <UInput
              v-model="name"
              class="w-full"
              size="xl"
              icon="i-lucide-user"
              autocomplete="name"
              :ui="{ base: 'px-4 py-3.5', leading: 'ps-4', trailing: 'pe-4' }"
            />
          </div>

          <div>
            <label class="mb-1.5 block text-sm font-medium text-slate-300">Email</label>
            <UInput
              v-model="email"
              class="w-full"
              type="email"
              size="xl"
              icon="i-lucide-mail"
              required
              autocomplete="email"
              :ui="{ base: 'px-4 py-3.5', leading: 'ps-4', trailing: 'pe-4' }"
            />
          </div>

          <div v-if="mode !== 'reset'">
            <label class="mb-1.5 block text-sm font-medium text-slate-300">Password</label>
            <UInput
              v-model="password"
              class="w-full"
              type="password"
              size="xl"
              icon="i-lucide-lock"
              required
              :minlength="mode === 'signup' ? 8 : undefined"
              autocomplete="current-password"
              :ui="{ base: 'px-4 py-3.5', leading: 'ps-4', trailing: 'pe-4' }"
            />
          </div>

          <div v-if="mode === 'signin'" class="-mt-2 text-right">
            <button
              type="button"
              class="text-sm text-slate-400 hover:text-white transition-colors"
              @click="switchMode('reset')"
            >
              Forgot password?
            </button>
          </div>

          <UButton
            class="mt-4"
            type="submit"
            block
            size="xl"
            color="primary"
            :loading="loading"
            :label="mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'"
            :ui="{ base: 'rounded-full py-3' }"
          />
        </form>

        <!-- Divider -->
        <div class="flex items-center gap-3">
          <div class="h-px flex-1 bg-slate-700" />
          <span class="text-xs text-slate-500">or</span>
          <div class="h-px flex-1 bg-slate-700" />
        </div>

        <!-- Google OAuth -->
        <UButton
          block
          size="xl"
          color="neutral"
          variant="solid"
          label="Continue with Google"
          :ui="{ base: 'rounded-full py-3' }"
          @click="signInWithGoogle"
        >
          <template #leading>
            <svg class="size-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
          </template>
        </UButton>

        <!-- Mode Toggle Links -->
        <div class="text-center text-sm pt-2">
          <template v-if="mode === 'signin'">
            <p class="text-slate-500">
              Don't have an account?
              <button
                type="button"
                class="text-primary-400 hover:text-primary-300 transition-colors"
                @click="switchMode('signup')"
              >
                Sign up
              </button>
            </p>
          </template>

          <template v-else>
            <p class="text-slate-500">
              Already have an account?
              <button
                type="button"
                class="text-primary-400 hover:text-primary-300 transition-colors"
                @click="switchMode('signin')"
              >
                Sign in
              </button>
            </p>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
