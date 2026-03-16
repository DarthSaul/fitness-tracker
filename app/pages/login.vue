<script setup lang="ts">
definePageMeta({ layout: 'default' })

const route = useRoute()
const { signInWithGoogle } = useAuth()

const errorMessages: Record<string, string> = {
  google_failed: 'Google sign-in failed. Please try again.',
  apple_failed: 'Apple sign-in failed. Please try again.',
  apple_no_email: 'Apple sign-in did not provide an email address.',
  upsert: 'Account setup failed. Please try again.',
}

const errorParam = computed(() => {
  const err = route.query.error
  return typeof err === 'string' ? err : null
})

const errorMessage = computed(() => {
  if (!errorParam.value) return null
  return errorMessages[errorParam.value] ?? 'An unexpected error occurred.'
})
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

      <div class="rounded-xl bg-slate-900 p-6">
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
