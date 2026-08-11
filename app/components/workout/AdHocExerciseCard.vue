<script setup lang="ts">
import type { AdHocExerciseGroup } from '~/types/workout'

const props = defineProps<{
  group: AdHocExerciseGroup
  editable: boolean
}>()

const emit = defineEmits<{
  'log-set': [completedSetId: string]
  'add-set': [exerciseName: string]
}>()

const expanded = ref(true)

function isLogged(set: AdHocExerciseGroup['sets'][number]): boolean {
  return set.reps !== null || set.weight !== null
}
</script>

<template>
  <div class="rounded-tile bg-surface">
    <!-- Header -->
    <div
      role="button"
      tabindex="0"
      class="flex w-full items-center gap-3 rounded-tile px-3 py-3 text-left"
      @click="expanded = !expanded"
      @keydown.enter="expanded = !expanded"
      @keydown.space.prevent="expanded = !expanded"
    >
      <div class="min-w-0 flex-1">
        <p class="font-medium text-label">{{ group.exerciseName }}</p>
      </div>
      <UIcon
        :name="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="size-6 shrink-0 text-label-secondary"
      />
    </div>

    <!-- Collapsible content -->
    <div
      class="grid overflow-hidden transition-all duration-200 ease-in-out"
      :class="expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
    >
      <div class="min-h-0">
        <div class="border-t border-separator px-3 pb-3 pt-2">
          <!-- Column headers -->
          <div class="grid grid-cols-4 items-center pb-2 text-caption2 font-semibold uppercase text-label-secondary">
            <span class="text-center font-medium">#</span>
            <span class="text-center font-medium">lb</span>
            <span class="text-center font-medium">Reps</span>
            <span class="text-center font-medium">Done</span>
          </div>

          <!-- Set rows -->
          <button
            v-for="(set, idx) in group.sets"
            :key="set.id"
            type="button"
            class="grid w-full grid-cols-4 items-center py-2 text-subheadline tnum transition-colors"
            :class="editable ? 'cursor-pointer hover:bg-label-secondary/15 rounded' : 'cursor-default'"
            @click="editable && emit('log-set', set.id)"
          >
            <span class="text-center text-label-secondary">{{ idx + 1 }}</span>
            <span class="text-center" :class="isLogged(set) ? 'text-ios-green' : 'text-label-tertiary'">
              {{ set.weight ?? '—' }}
            </span>
            <span class="text-center" :class="isLogged(set) ? 'text-ios-green' : 'text-label-tertiary'">
              {{ set.reps ?? '—' }}
            </span>
            <span class="flex justify-center">
              <UIcon
                v-if="isLogged(set)"
                name="i-lucide-check"
                class="size-4 text-ios-green"
              />
              <span v-else class="size-4" />
            </span>
          </button>

          <!-- Add Set button -->
          <button
            v-if="editable"
            type="button"
            class="mt-1 flex w-full items-center justify-center gap-1.5 rounded-chip py-2 text-xs text-label-tertiary transition-colors hover:text-label-secondary"
            @click.stop="emit('add-set', group.exerciseName)"
          >
            <UIcon name="i-lucide-plus" class="size-3" />
            Add Set
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
