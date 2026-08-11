/**
 * Compact metric tile: tinted glyph over a large value over a caption label,
 * on a 10pt surface. Designed to sit three-across inside `AppStatTileGroup`.
 * Mirrors `StatTile` in `Features/Analytics/AnalyticsView.swift`.
 */
<script setup lang="ts">
withDefaults(defineProps<{
  icon: string
  /** Pre-formatted for display — the tile does no number formatting itself. */
  value: string
  label?: string
}>(), {
  label: '',
})
</script>

<template>
  <div class="flex w-full flex-col items-start gap-1 rounded-tile bg-surface px-3 py-2.5">
    <UIcon :name="icon" class="size-3 text-tint" />
    <span class="w-full truncate text-title3 font-semibold tnum">{{ value }}</span>
    <span class="text-caption2 text-label-secondary">{{ label }}</span>
  </div>
</template>
