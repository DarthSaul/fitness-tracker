/**
 * Small capsule tag — an optional glyph plus a label on a neutral 18% wash.
 * Used for the exercise-card utility row (Rest / Trend / Swap / Notes) and for
 * inline metadata. Mirrors the `chip` helper in
 * `Features/Workouts/Live/ExerciseCard.swift`.
 */
<script setup lang="ts">
withDefaults(defineProps<{
  icon?: string
  label?: string
  /** Render as a button when the chip is tappable; defaults to inert. */
  as?: 'span' | 'button'
}>(), {
  icon: undefined,
  label: undefined,
  as: 'span',
})

const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <component
    :is="as"
    :type="as === 'button' ? 'button' : undefined"
    class="inline-flex items-center gap-1 rounded-full bg-label-secondary/18 px-2 py-[3px] text-caption2 font-semibold text-label"
    @click="as === 'button' && emit('click')"
  >
    <UIcon v-if="icon" :name="icon" class="size-3 shrink-0" />
    <slot>{{ label }}</slot>
  </component>
</template>
