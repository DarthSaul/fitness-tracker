/**
 * Full-width tinted call-to-action row used at the foot of home cards:
 * label on the left, chevron on the right, on a 15%-opacity wash of its own
 * tint. Mirrors the `actionPill` helper in `Features/Home/HomeTodayCard.swift`.
 *
 * Renders as a link when `to` is set and a button otherwise, so the same
 * component covers "Resume workout" (navigates) and "Start next workout"
 * (performs an action).
 */
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

type Tint = 'green' | 'tint' | 'secondary' | 'red'

const props = withDefaults(defineProps<{
  label: string
  /** Trailing glyph. Pass an empty string to omit it. */
  icon?: string
  tint?: Tint
  to?: RouteLocationRaw
  disabled?: boolean
  loading?: boolean
}>(), {
  icon: 'i-lucide-chevron-right',
  tint: 'tint',
  to: undefined,
  disabled: false,
  loading: false,
})

const emit = defineEmits<{ click: [] }>()

/** Full class strings so Tailwind's scanner can see every variant. */
const TINT_CLASSES: Record<Tint, string> = {
  green: 'text-ios-green bg-ios-green/15',
  tint: 'text-tint bg-tint/15',
  secondary: 'text-label-secondary bg-label-secondary/15',
  red: 'text-ios-red bg-ios-red/15',
}

const classes = computed(() => [
  'flex w-full items-center justify-between gap-2 rounded-chip px-2.5 py-1.5 text-subheadline font-medium transition-opacity',
  TINT_CLASSES[props.tint],
  props.disabled || props.loading ? 'pointer-events-none opacity-50' : '',
])
</script>

<template>
  <NuxtLink v-if="to" :to="to" :class="classes">
    <span>{{ label }}</span>
    <UIcon v-if="icon" :name="icon" class="size-4 shrink-0" />
  </NuxtLink>
  <button
    v-else
    type="button"
    :class="classes"
    :disabled="disabled || loading"
    @click="emit('click')"
  >
    <span>{{ label }}</span>
    <UIcon
      v-if="loading"
      name="i-lucide-loader-circle"
      class="size-4 shrink-0 animate-spin"
    />
    <UIcon v-else-if="icon" :name="icon" class="size-4 shrink-0" />
  </button>
</template>
