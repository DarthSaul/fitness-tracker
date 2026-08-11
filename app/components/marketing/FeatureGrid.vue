/**
 * What the product actually does, one AppCard per capability.
 */
<script setup lang="ts">
const features = [
  {
    icon: 'i-lucide-library',
    title: 'Program library',
    body: 'Start from a full multi-week program with every week, day, exercise and set already defined. No spreadsheet to maintain.',
  },
  {
    icon: 'i-lucide-calendar-check',
    title: 'Week-by-week progression',
    body: 'The app knows which day is next. Finish a workout and it advances you — no bookkeeping, no guessing where you left off.',
  },
  {
    icon: 'i-lucide-list-checks',
    title: 'Set-by-set logging',
    body: 'Tap a set, enter weight and reps, done. Prescribed targets are pre-filled, so a normal set is a single tap.',
  },
  {
    icon: 'i-lucide-repeat',
    title: 'Swap any exercise',
    body: 'Rack taken? Shoulder cranky? Swap an exercise for the session without losing the program\'s structure or your history.',
  },
  {
    icon: 'i-lucide-timer',
    title: 'Rest timer',
    body: 'A between-sets timer that keeps running while you scroll, counting the rest the program actually prescribes.',
  },
  {
    icon: 'i-lucide-zap',
    title: 'Strength on the Go',
    body: 'Away from your program? Standalone sessions you can start and finish on their own, logged the same way.',
  },
]
</script>

<template>
  <section id="features" class="mx-auto w-full max-w-frame scroll-mt-16 px-6 py-14 lg:px-10 lg:py-20">
    <h2 class="max-w-2xl text-title text-label sm:text-display">
      Everything the session needs, nothing it doesn't
    </h2>

    <div class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <AppCard v-for="feature in features" :key="feature.title">
        <span class="flex size-10 items-center justify-center rounded-tile bg-tint/15">
          <UIcon :name="feature.icon" class="size-5 text-tint" />
        </span>
        <h3 class="mt-4 text-headline text-label">{{ feature.title }}</h3>
        <p class="mt-1.5 text-subheadline text-label-secondary">{{ feature.body }}</p>
      </AppCard>
    </div>
  </section>
</template>
