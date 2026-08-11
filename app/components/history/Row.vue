/**
 * One completed session in the history list: date, a line identifying the
 * workout, and the number of sets logged. Mirrors `HistoryRow.swift`.
 */
<script setup lang="ts">
import type { HistoryEntry } from '~/types/history'

const props = defineProps<{ entry: HistoryEntry }>()

/** Weekday + short date, e.g. "Wed Jan 15". */
const dateLabel = computed(() =>
  new Date(props.entry.completedAt).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }),
)

const subtitle = computed(() => {
  if (props.entry.type === 'PROGRAM') {
    return `${props.entry.programName} · Week ${props.entry.weekNumber}, Day ${props.entry.dayNumber}`
  }
  return props.entry.standaloneWorkout.name
})

const to = computed(() =>
  props.entry.type === 'PROGRAM'
    ? `/history/${props.entry.id}`
    : `/history/standalone/${props.entry.id}`,
)

const setCount = computed(() => props.entry._count.completedSets)
</script>

<template>
  <NuxtLink :to="to" class="flex items-center gap-3 px-4 py-2.5">
    <span class="min-w-0 flex-1">
      <span class="block text-subheadline font-semibold">{{ dateLabel }}</span>
      <span class="block truncate text-caption text-label-secondary">{{ subtitle }}</span>
    </span>
    <span class="shrink-0 text-caption tnum text-label-secondary">
      {{ setCount }} {{ setCount === 1 ? 'set' : 'sets' }}
    </span>
    <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-label-tertiary" />
  </NuxtLink>
</template>
