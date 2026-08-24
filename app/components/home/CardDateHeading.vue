/**
 * Selected-date heading rendered inside the Home day cards from `xl` up, so
 * the card's top edge aligns with the calendar card. Hidden below `xl`, where
 * the standalone heading above the card is shown instead.
 */
<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <h2 class="hidden text-lg font-semibold text-label xl:mb-4 xl:block">
    {{ label }}
  </h2>
</template>
