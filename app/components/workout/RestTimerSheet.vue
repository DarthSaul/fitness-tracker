/**
 * Between-sets rest timer. Mirrors `RestTimerSheet.swift`: a large monospaced
 * readout with Pause/Start and Reset, on a short detent.
 *
 * Counting continues while the sheet is closed, so dismissing it to log the
 * next set doesn't lose the rest interval.
 */
<script setup lang="ts">
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const { display, running, reset, toggle } = useRestTimer()

const isOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
})
</script>

<template>
  <AppSheet v-model:open="isOpen" title="Rest" description="Time between sets">
    <div class="flex flex-col items-center gap-6 py-2">
      <p class="text-[64px] font-semibold leading-none tnum">{{ display }}</p>

      <div class="flex w-full gap-3">
        <UButton
          class="flex-1 justify-center"
          size="xl"
          :icon="running ? 'i-lucide-pause' : 'i-lucide-play'"
          :label="running ? 'Pause' : 'Start'"
          @click="toggle"
        />
        <UButton
          class="flex-1 justify-center"
          size="xl"
          variant="soft"
          color="neutral"
          icon="i-lucide-rotate-ccw"
          label="Reset"
          @click="reset"
        />
      </div>
    </div>
  </AppSheet>
</template>
