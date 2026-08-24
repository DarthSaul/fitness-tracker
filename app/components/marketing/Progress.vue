/**
 * The analytics pitch: why e1RM is the number worth watching.
 *
 * Carries the one wide screenshot slot, empty until the capture pass; the
 * section falls back to a single centred column until it is filled.
 */
<script setup lang="ts">
type Shot = { src: string, src2x: string, w: number, h: number, alt: string }

/**
 * Wide capture at 1280×800 CSS, DPR 2, dark scheme. `public/img/screens/`.
 *
 * Typed via assertion rather than annotation: with `const SHOT: Shot | null
 * = null`, vue-tsc narrows the literal `null` to `never` inside `v-if="SHOT"`
 * and every `SHOT.foo` in the template fails TS2339.
 */
const SHOT = null as Shot | null

const stats = [
  { label: 'Sessions logged', hint: 'all time and this week' },
  { label: 'Volume lifted', hint: 'total pounds moved' },
  { label: 'e1RM per exercise', hint: 'charted session by session' },
]
</script>

<template>
  <section id="progress" class="mx-auto w-full max-w-frame scroll-mt-16 px-6 py-14 lg:px-10 lg:py-20">
    <div class="grid items-center gap-10 lg:gap-16" :class="SHOT ? 'lg:grid-cols-2' : ''">
      <div v-if="SHOT" class="overflow-hidden rounded-card bg-surface">
        <img
          :src="SHOT.src"
          :srcset="`${SHOT.src} ${SHOT.w}w, ${SHOT.src2x} ${SHOT.w * 2}w`"
          sizes="(min-width: 1024px) 560px, 100vw"
          :width="SHOT.w"
          :height="SHOT.h"
          :alt="SHOT.alt"
          class="block w-full"
          loading="lazy"
        >
      </div>

      <div :class="SHOT ? '' : 'mx-auto max-w-2xl text-center'">
        <h2 class="text-title text-label sm:text-display">Progress you can actually see</h2>

        <p class="mt-4 text-body text-label-secondary">
          Estimated 1-rep max normalises across rep ranges, so a 5×5 month and a
          3×12 month sit on the same trend line. Your average weight would drop
          as reps go up even while you were getting stronger — e1RM doesn't.
        </p>

        <dl class="mt-8 grid gap-4 sm:grid-cols-3" :class="SHOT ? '' : 'text-left'">
          <div v-for="stat in stats" :key="stat.label" class="rounded-tile bg-surface px-4 py-3">
            <dt class="text-subheadline font-semibold text-label">{{ stat.label }}</dt>
            <dd class="mt-0.5 text-footnote text-label-secondary">{{ stat.hint }}</dd>
          </div>
        </dl>
      </div>
    </div>
  </section>
</template>
