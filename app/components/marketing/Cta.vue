/**
 * Closing call to action, on the brand card.
 */
<template>
  <section class="mx-auto w-full max-w-frame px-6 pb-16 lg:px-10 lg:pb-24">
    <AppCard rail="brand">
      <div class="px-2 py-6 text-center sm:px-8 sm:py-10">
        <h2 class="text-title text-label sm:text-display">Ready to start week 1?</h2>
        <p class="mx-auto mt-3 max-w-md text-body text-label-secondary">
          Sign up, pick a program, and log your first set today.
        </p>

        <div class="mt-7 flex justify-center">
          <UButton to="/login?signup=1" size="xl" color="primary" label="Get started" />
        </div>
      </div>
    </AppCard>
  </section>
</template>
