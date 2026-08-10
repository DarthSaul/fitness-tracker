/**
 * Large in-flow screen title for tab roots, paired with the tab's emoji.
 *
 * iOS drops the system navigation bar on tab roots and puts this in the scroll
 * flow instead, so the title scrolls away and is replaced by the floating chip
 * in the app shell. Mirrors `Core/UI/ScreenTitleHeader.swift`.
 */
<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  emoji?: string
  /** Optional line beneath the title, e.g. "Completed workouts". */
  subtitle?: string
}>(), {
  emoji: undefined,
  subtitle: undefined,
})
</script>

<template>
  <header class="px-4 pt-2 pb-2">
    <div class="flex items-baseline justify-between gap-3">
      <h1 class="text-large-title">{{ title }}</h1>
      <span v-if="emoji" class="text-large-title" aria-hidden="true">{{ emoji }}</span>
    </div>
    <p v-if="subtitle" class="mt-1 text-subheadline text-label-secondary">{{ subtitle }}</p>
  </header>
</template>
