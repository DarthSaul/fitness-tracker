/**
 * Three-step explanation of the loop: pick a program, train, watch it add up.
 *
 * Each step has a screenshot slot that stays empty until the capture pass. The
 * whole figure is gated on the array so there is no placeholder chrome in the
 * meantime — populate `SHOTS` and the images appear. See the capture spec in
 * the implementation plan for sizes and how to shoot them.
 */
<script setup lang="ts">
type Shot = {
  src: string
  src2x: string
  /** Intrinsic width of the 1x file, in px. */
  w: number
  h: number
  alt: string
}

/**
 * Phone-portrait captures at 390×844 CSS, DPR 2, dark scheme.
 * Files belong in `public/img/screens/`.
 */
const SHOTS: Record<string, Shot> = {}

const STEPS = [
  {
    key: 'home',
    n: '1',
    title: 'Pick a program',
    body: 'Browse the library, save the ones you like, and make one active. Everything else follows from that.',
  },
  {
    key: 'workout',
    n: '2',
    title: 'Train',
    body: 'Open today\'s workout and log each set as you go. Swap exercises, add extra sets, or log something the program never planned for.',
  },
  {
    key: 'history',
    n: '3',
    title: 'Watch it add up',
    body: 'Every session lands in your history, and your estimated 1-rep max charts itself per exercise.',
  },
]

/** Resolves each step's screenshot once, so the template has no repeated lookups. */
const steps = computed(() => STEPS.map(step => ({ ...step, shot: SHOTS[step.key] ?? null })))
</script>

<template>
  <section
    id="how-it-works"
    class="border-y border-separator bg-canvas-grouped scroll-mt-16 py-14 lg:py-20"
  >
    <div class="mx-auto w-full max-w-frame px-6 lg:px-10">
      <h2 class="max-w-2xl text-title text-label sm:text-display">
        Three steps, then just keep showing up
      </h2>

      <ol class="mt-10 grid gap-10 lg:grid-cols-3 lg:gap-8">
        <li v-for="step in steps" :key="step.key">
          <span
            class="flex size-8 items-center justify-center rounded-full bg-tint text-subheadline font-semibold tnum text-white"
            aria-hidden="true"
          >
            {{ step.n }}
          </span>
          <h3 class="mt-4 text-title3 text-label">{{ step.title }}</h3>
          <p class="mt-1.5 text-subheadline text-label-secondary">{{ step.body }}</p>

          <div v-if="step.shot" class="mt-6 overflow-hidden rounded-card bg-surface">
            <img
              :src="step.shot.src"
              :srcset="`${step.shot.src} ${step.shot.w}w, ${step.shot.src2x} ${step.shot.w * 2}w`"
              sizes="(min-width: 1024px) 260px, 70vw"
              :width="step.shot.w"
              :height="step.shot.h"
              :alt="step.shot.alt"
              class="block w-full"
              loading="lazy"
            >
          </div>
        </li>
      </ol>
    </div>
  </section>
</template>
