/**
 * "Workout in progress" affordance, shown while a session is open and the user
 * is somewhere other than the session itself.
 *
 * Two shapes for two shells. `floating` is the phone treatment: a pill inset
 * from the screen edges and pinned to the top of the tab bar, so it reads as
 * one piece with it. `inline` is the desktop treatment: a card sitting in the
 * side rail, where there is no tab bar to hang off.
 */
<script setup lang="ts">
withDefaults(defineProps<{
  to: string
  subtitle: string
  variant?: 'floating' | 'inline'
}>(), { variant: 'floating' })
</script>

<template>
  <NuxtLink
    :to="to"
    class="flex items-center gap-3 bg-material shadow-chip backdrop-blur-2xl backdrop-saturate-150"
    :class="variant === 'floating'
      ? 'absolute inset-x-0 bottom-full mx-[22px] mb-1.5 rounded-full px-4 py-2.5'
      : 'w-full rounded-panel px-3 py-2.5 transition-colors hover:bg-fill'"
    :aria-label="`Resume workout, ${subtitle}`"
  >
    <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-tint">
      <!-- Always white: the circle behind it is the tint in both schemes -->
      <UIcon name="i-lucide-dumbbell" class="size-5 text-white" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block text-subheadline font-semibold">Workout in progress</span>
      <span class="block truncate text-caption text-label-secondary">{{ subtitle }}</span>
    </span>
    <span v-if="variant === 'floating'" class="text-subheadline font-semibold text-tint">Resume</span>
  </NuxtLink>
</template>
