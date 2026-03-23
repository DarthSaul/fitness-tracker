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
  <div class="flex min-h-dvh items-center justify-center px-4">
    <div class="w-full max-w-sm space-y-6">
      <div class="text-center">
        <h1 class="text-3xl font-bold tracking-tight text-white">
          Workout Tracker
        </h1>
        <p class="mt-2 text-sm text-slate-400">
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

      <div class="rounded-xl bg-slate-900 p-6 space-y-4">
        <!-- Email/Password Form -->
        <form @submit.prevent="handleEmailSubmit" class="space-y-3">
          <UInput
            v-if="mode === 'signup'"
            v-model="name"
            placeholder="Name (optional)"
            size="lg"
            icon="i-lucide-user"
            autocomplete="name"
          />

          <UInput
            v-model="email"
            type="email"
            placeholder="Email"
            size="lg"
            icon="i-lucide-mail"
            required
            autocomplete="email"
          />

          <UInput
            v-if="mode !== 'reset'"
            v-model="password"
            type="password"
            placeholder="Password"
            size="lg"
            icon="i-lucide-lock"
            required
            :minlength="mode === 'signup' ? 8 : undefined"
            autocomplete="current-password"
          />

          <UButton
            type="submit"
            block
            size="lg"
            color="primary"
            :loading="loading"
            :label="mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'"
          />
        </form>

        <!-- Mode Toggle Links -->
        <div class="text-center text-sm space-y-1">
          <template v-if="mode === 'signin'">
            <button
              type="button"
              class="text-slate-400 hover:text-white transition-colors"
              @click="switchMode('reset')"
            >
              Forgot password?
            </button>
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

        <!-- Divider -->
        <div class="flex items-center gap-3">
          <div class="h-px flex-1 bg-slate-700" />
          <span class="text-xs text-slate-500">or</span>
          <div class="h-px flex-1 bg-slate-700" />
        </div>

        <!-- Google OAuth -->
        <UButton
          block
          size="lg"
          color="neutral"
          variant="solid"
          icon="i-lucide-chrome"
          label="Continue with Google"
          @click="signInWithGoogle"
        />
      </div>
    </div>
  </div>
</template>
