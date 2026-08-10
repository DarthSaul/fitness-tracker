/**
 * Loading placeholder block. Every UI area that fetches from the API renders
 * one of these while the request is pending (see the Loading Skeletons
 * convention in CLAUDE.md).
 *
 * iOS uses a flat 10–12% wash with no shimmer; the pulse here is the web
 * equivalent of "this is not content yet" without inventing a new motion
 * language.
 */
<script setup lang="ts">
type Radius = 'tile' | 'panel' | 'card' | 'chip' | 'full'

const props = withDefaults(defineProps<{
  /** CSS length, or a number treated as px. */
  height: string | number
  width?: string | number
  radius?: Radius
  /** Render N stacked blocks — for list placeholders. */
  count?: number
}>(), {
  width: undefined,
  radius: 'tile',
  count: 1,
})

const RADIUS_CLASSES: Record<Radius, string> = {
  tile: 'rounded-tile',
  panel: 'rounded-panel',
  card: 'rounded-card',
  chip: 'rounded-chip',
  full: 'rounded-full',
}

/** Bare numbers are px; anything else is passed through as a CSS length. */
function toLength(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined
  return typeof value === 'number' ? `${value}px` : value
}

const blockStyle = computed(() => ({
  height: toLength(props.height),
  width: toLength(props.width),
}))

const radiusClass = computed(() => RADIUS_CLASSES[props.radius])
</script>

<template>
  <div class="flex flex-col gap-2" aria-hidden="true">
    <div
      v-for="i in count"
      :key="i"
      class="animate-pulse bg-label-secondary/12"
      :class="radiusClass"
      :style="blockStyle"
    />
  </div>
</template>
