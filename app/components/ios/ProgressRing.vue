/**
 * Circular progress ring with a centred `done/total` label — the program
 * progress indicator on the home screen. Mirrors the ring in
 * `Features/Home/ActiveProgramProgressCard.swift`: 5pt stroke, round cap,
 * tinted trim over a 20%-opacity track, animating over 0.4s.
 */
<script setup lang="ts">
const props = withDefaults(defineProps<{
  value: number
  total: number
  /** Outer diameter in px. */
  size?: number
  strokeWidth?: number
  /** Hide the centred label when the ring is used purely decoratively. */
  showLabel?: boolean
}>(), {
  size: 64,
  strokeWidth: 5,
  showLabel: true,
})

const radius = computed(() => (props.size - props.strokeWidth) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)

/** Guards total <= 0 so an empty program renders an empty ring, not NaN. */
const fraction = computed(() => {
  if (props.total <= 0) return 0
  return Math.min(1, Math.max(0, props.value / props.total))
})

const dashOffset = computed(() => circumference.value * (1 - fraction.value))
</script>

<template>
  <div
    class="relative shrink-0"
    :style="{ width: `${size}px`, height: `${size}px` }"
    role="img"
    :aria-label="`${value} of ${total} days complete`"
  >
    <svg
      :width="size"
      :height="size"
      :viewBox="`0 0 ${size} ${size}`"
      class="-rotate-90"
      aria-hidden="true"
    >
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        stroke="currentColor"
        :stroke-width="strokeWidth"
        class="text-label-secondary/20"
      />
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        stroke="currentColor"
        :stroke-width="strokeWidth"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
        class="text-tint transition-[stroke-dashoffset] duration-[400ms] ease-out"
      />
    </svg>
    <span
      v-if="showLabel"
      class="absolute inset-0 flex items-center justify-center text-caption font-semibold tnum"
    >
      {{ value }}/{{ total }}
    </span>
  </div>
</template>
