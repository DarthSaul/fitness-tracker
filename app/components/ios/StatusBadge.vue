/**
 * Status capsule — coloured text on a 20% wash of the same colour.
 *
 * The colour carries meaning and is not decorative: green = active or
 * complete, orange = in progress / swapped / beta, red = destructive or
 * failed, gray = inert. Mirrors the badges in `ProgramListView.swift`,
 * `ExerciseCard.swift` and `BetaTag.swift`.
 */
<script setup lang="ts">
type BadgeColor = 'green' | 'orange' | 'red' | 'tint' | 'purple' | 'gray'

const props = withDefaults(defineProps<{
  label?: string
  color?: BadgeColor
}>(), {
  label: undefined,
  color: 'green',
})

/** Full class strings so Tailwind's scanner can see every variant. */
const COLOR_CLASSES: Record<BadgeColor, string> = {
  green: 'text-ios-green bg-ios-green/20',
  orange: 'text-ios-orange bg-ios-orange/20',
  red: 'text-ios-red bg-ios-red/20',
  tint: 'text-tint bg-tint/20',
  purple: 'text-ios-purple bg-ios-purple/20',
  gray: 'text-label-secondary bg-label-secondary/20',
}

const colorClass = computed(() => COLOR_CLASSES[props.color])
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-caption2 font-semibold"
    :class="colorClass"
  >
    <slot>{{ label }}</slot>
  </span>
</template>
