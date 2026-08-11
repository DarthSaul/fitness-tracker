/**
 * Closing call to action, on the brand card.
 */
<script setup lang="ts">
const { signInWithGoogle } = useAuth()
</script>

<template>
  <section class="mx-auto w-full max-w-frame px-6 pb-16 lg:px-10 lg:pb-24">
    <AppCard rail="brand">
      <div class="px-2 py-6 text-center sm:px-8 sm:py-10">
        <h2 class="text-title text-label sm:text-display">Ready to start week 1?</h2>
        <p class="mx-auto mt-3 max-w-md text-body text-label-secondary">
          Sign up, pick a program, and log your first set today.
        </p>

        <div class="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <UButton
            size="xl"
            color="primary"
            icon="i-lucide-log-in"
            label="Continue with Google"
            @click="signInWithGoogle"
          />
          <UButton
            to="/login?signup=1"
            size="xl"
            color="neutral"
            variant="outline"
            label="Create an account"
          />
        </div>

        <p class="mt-5 text-footnote text-label-secondary">
          Already have an account?
          <NuxtLink to="/login" class="font-medium text-tint hover:underline">Sign in</NuxtLink>
        </p>
      </div>
    </AppCard>
  </section>
</template>
