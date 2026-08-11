/**
 * Sign-in screen — full-bleed hero art with the auth stack docked at the
 * bottom, mirroring `AuthView.swift`. From `lg` it becomes a centred card with
 * the art beside the form instead of behind it.
 *
 * The card stays dark at every width even though the page around it follows
 * the colour scheme: the provider buttons are black-on-white-hairline by iOS
 * convention, and they only read correctly against a dark ground.
 *
 * iOS offers only Sign in with Apple and Google; the web additionally keeps
 * email/password, tucked behind "Continue with email" so it doesn't cover the
 * artwork until asked for.
 */
<script setup lang="ts">
definePageMeta({ layout: 'default' })

const route = useRoute()
const config = useRuntimeConfig()
const { signInWithGoogle, signInWithApple, signInWithEmail, signUpWithEmail, resetPassword } = useAuth()

type AuthMode = 'signin' | 'signup' | 'reset'
const mode = ref<AuthMode>('signin')

/** Web Sign in with Apple needs a Services ID and key that may not be set. */
const appleEnabled = computed(() => config.public.appleAuthEnabled)

const emailOpen = ref(false)
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
  email_confirmed: '',
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

// The landing page's "Get started" CTA opens straight into the signup form, so
// `/login` stays the single auth surface rather than growing a sibling page.
if (route.query.signup === '1') {
  emailOpen.value = true
  mode.value = 'signup'
}

const submitLabel = computed(() => {
  if (mode.value === 'signup') return 'Create Account'
  if (mode.value === 'reset') return 'Send Reset Link'
  return 'Sign In'
})

function switchMode(newMode: AuthMode) {
  mode.value = newMode
  formError.value = null
  successMessage.value = null
}

function closeEmail() {
  emailOpen.value = false
  switchMode('signin')
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
        switchMode('signin')
        successMessage.value = 'Check your email to confirm your account before signing in.'
      }
      else {
        await navigateTo('/home')
      }
    }
    else {
      await signInWithEmail(email.value, password.value)
      await navigateTo('/home')
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
  <!--
    Phones get the full-bleed art with the stack docked at the bottom, as on
    iOS. From `lg` the same pieces become a centred card — art beside the form
    rather than blown up behind it, which is what a 940px-wide portrait looks
    like stretched across a laptop.

    `contents` means the card wrapper generates no box below `lg`, so the phone
    layout is byte-identical to what shipped.
  -->
  <div
    class="relative flex min-h-dvh flex-col justify-end overflow-hidden bg-black lg:flex-row lg:items-center lg:justify-center lg:overflow-auto lg:bg-canvas lg:p-10"
  >
    <!--
      A fixed height at `lg`, because the art is a tall portrait and would
      otherwise drive the card past the viewport; object-cover crops it. The
      hairline is what separates a black card from the black canvas in dark
      mode — in light mode the contrast does that on its own.
    -->
    <div class="contents lg:flex lg:h-[560px] lg:w-full lg:max-w-4xl lg:items-stretch lg:overflow-hidden lg:rounded-card lg:border lg:border-separator lg:bg-black">
      <!--
        The art is framed slightly left of centre, matching the -45pt offset the
        iOS screen applies so the two figures sit under the button stack.
      -->
      <div class="absolute inset-0 lg:static lg:w-1/2 lg:shrink-0">
        <img
          src="/img/login-hero.jpg"
          srcset="/img/login-hero.jpg 640w, /img/login-hero@2x.jpg 940w"
          sizes="(min-width: 1024px) 448px, 100vw"
          alt=""
          aria-hidden="true"
          class="size-full object-cover"
          style="object-position: 42% center"
        >

        <!-- Scrim so the docked stack stays legible over the art; on desktop
             the stack sits beside it and needs none. -->
        <div class="pointer-events-none absolute inset-x-0 bottom-0 h-[360px] bg-gradient-to-t from-black/90 via-black/65 to-transparent lg:hidden" />
      </div>

      <div
        class="relative z-10 mx-auto w-full max-w-md space-y-4 px-8 pb-[calc(env(safe-area-inset-bottom)_+_2rem)] lg:my-auto lg:max-w-none lg:flex-1 lg:px-10 lg:py-14"
      >
        <!--
          Desktop only: the phone layout gets its identity from the full-bleed
          art behind the stack, which the card treatment takes away.
        -->
        <div class="hidden lg:mb-2 lg:block">
          <div class="flex items-center gap-2.5">
            <img src="/icons/icon-192.png" alt="" aria-hidden="true" class="size-8 rounded-tile">
            <span class="text-headline font-bold tracking-tight text-white">DR. DUMBBELL</span>
          </div>
          <p class="mt-4 text-title2 font-semibold text-white">Welcome back</p>
          <p class="mt-1 text-subheadline text-white/70">
            Sign in to pick up your program where you left off.
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

        <!-- Provider buttons — solid black with a hairline white edge, per iOS -->
        <template v-if="!emailOpen">
          <button
            v-if="appleEnabled"
            type="button"
            class="flex h-[50px] w-full items-center justify-center gap-2 rounded-chip border border-white bg-black text-[19px] font-medium text-white transition-opacity active:opacity-80"
            @click="signInWithApple"
          >
            <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.05 12.54c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.83-.81-3.01-.79-1.55.02-2.98.9-3.78 2.29-1.61 2.79-.41 6.92 1.16 9.19.77 1.11 1.68 2.35 2.88 2.31 1.16-.05 1.6-.75 3-.75s1.79.75 3.01.72c1.24-.02 2.03-1.13 2.79-2.24.88-1.28 1.24-2.53 1.26-2.59-.03-.01-2.42-.93-2.44-3.69zM14.79 5.4c.64-.77 1.07-1.85.95-2.92-.92.04-2.03.61-2.69 1.38-.59.68-1.11 1.77-.97 2.82 1.02.08 2.07-.52 2.71-1.28z" />
            </svg>
            Sign in with Apple
          </button>

          <button
            type="button"
            class="flex h-[50px] w-full items-center justify-center gap-2 rounded-chip border border-white bg-black text-[19px] font-medium text-white transition-opacity active:opacity-80"
            @click="signInWithGoogle"
          >
            <span class="text-[18px] font-bold">G</span>
            Sign in with Google
          </button>

          <button
            type="button"
            class="w-full py-1 text-subheadline font-medium text-white/70 transition-colors hover:text-white"
            @click="emailOpen = true"
          >
            Continue with email
          </button>
        </template>

        <!-- Email / password, on the same dark treatment as the buttons -->
        <template v-else>
          <form class="space-y-3" @submit.prevent="handleEmailSubmit">
            <UInput
              v-if="mode === 'signup'"
              v-model="name"
              class="w-full"
              size="xl"
              placeholder="Name (optional)"
              icon="i-lucide-user"
              autocomplete="name"
            />

            <UInput
              v-model="email"
              class="w-full"
              type="email"
              size="xl"
              placeholder="Email"
              icon="i-lucide-mail"
              required
              autocomplete="email"
            />

            <UInput
              v-if="mode !== 'reset'"
              v-model="password"
              class="w-full"
              type="password"
              size="xl"
              placeholder="Password"
              icon="i-lucide-lock"
              required
              :minlength="mode === 'signup' ? 8 : undefined"
              :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
            />

            <button
              v-if="mode === 'signin'"
              type="button"
              class="block w-full text-right text-footnote text-white/70 transition-colors hover:text-white"
              @click="switchMode('reset')"
            >
              Forgot password?
            </button>

            <UButton
              type="submit"
              block
              size="xl"
              color="primary"
              :loading="loading"
              :label="submitLabel"
            />
          </form>

          <div class="flex items-center justify-between text-footnote">
            <button
              type="button"
              class="text-white/70 transition-colors hover:text-white"
              @click="closeEmail"
            >
              ← Back
            </button>
            <button
              v-if="mode === 'signin'"
              type="button"
              class="text-tint"
              @click="switchMode('signup')"
            >
              Create an account
            </button>
            <button
              v-else
              type="button"
              class="text-tint"
              @click="switchMode('signin')"
            >
              Sign in instead
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
