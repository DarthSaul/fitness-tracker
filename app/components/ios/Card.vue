/**
 * The signature iOS surface: a flat `secondarySystemBackground` fill at 14pt
 * radius with 16pt padding — no border and no shadow, since depth in the
 * design system comes purely from surface-vs-background contrast.
 *
 * Home cards add an 8pt full-height gradient rail down the leading edge, which
 * is the app's only real brand moment. Mirrors `HomeCardChrome` in
 * `Features/Home/HomeTodayCard.swift`.
 */
<script setup lang="ts">
type Rail = 'brand' | 'completed' | 'muted'

const props = withDefaults(defineProps<{
  /** Leading gradient rail. Omit for a plain surface card. */
  rail?: Rail
  /** Minimum content height in px — iOS home cards use 180. */
  minHeight?: number
  /** Set false when the slot supplies its own padding (e.g. a divided list). */
  padded?: boolean
}>(), {
  rail: undefined,
  minHeight: undefined,
  padded: true,
})

/** Full class strings, not interpolated — Tailwind only compiles what it can see. */
const RAIL_CLASSES: Record<Rail, string> = {
  brand: 'bg-gradient-to-b from-ios-purple to-ios-pink',
  completed: 'bg-gradient-to-b from-ios-green to-ios-mint',
  muted: 'bg-gradient-to-b from-ios-gray to-ios-gray/50',
}

const railClass = computed(() => (props.rail ? RAIL_CLASSES[props.rail] : ''))
</script>

<template>
  <div class="flex overflow-hidden rounded-card bg-surface">
    <div v-if="rail" class="w-2 shrink-0" :class="railClass" />
    <div
      class="min-w-0 flex-1"
      :class="padded ? 'p-4' : ''"
      :style="minHeight ? { minHeight: `${minHeight}px` } : undefined"
    >
      <slot />
    </div>
  </div>
</template>
