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
  <div class="rounded-lg bg-slate-800/50">
    <!-- Header -->
    <div
      role="button"
      tabindex="0"
      class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left"
      @click="expanded = !expanded"
      @keydown.enter="expanded = !expanded"
      @keydown.space.prevent="expanded = !expanded"
    >
      <div class="min-w-0 flex-1">
        <p class="font-medium text-white">{{ group.exerciseName }}</p>
      </div>
      <UIcon
        :name="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="size-6 shrink-0 text-slate-400"
      />
    </div>

    <!-- Collapsible content -->
    <div
      class="grid overflow-hidden transition-all duration-200 ease-in-out"
      :class="expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
    >
      <div class="min-h-0">
        <div class="border-t border-slate-700/50 px-3 pb-3 pt-2">
          <!-- Column headers -->
          <div class="adhoc-grid pb-2 text-[10px] uppercase tracking-wider text-slate-500">
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
            class="adhoc-grid w-full py-2 text-sm transition-colors"
            :class="editable ? 'cursor-pointer hover:bg-slate-700/30 rounded' : 'cursor-default'"
            @click="editable && emit('log-set', set.id)"
          >
            <span class="text-center text-slate-400">{{ idx + 1 }}</span>
            <span class="text-center" :class="isLogged(set) ? 'text-emerald-400' : 'text-slate-600'">
              {{ set.weight ?? '—' }}
            </span>
            <span class="text-center" :class="isLogged(set) ? 'text-emerald-400' : 'text-slate-600'">
              {{ set.reps ?? '—' }}
            </span>
            <span class="flex justify-center">
              <UIcon
                v-if="isLogged(set)"
                name="i-lucide-check"
                class="size-4 text-emerald-400"
              />
              <span v-else class="size-4" />
            </span>
          </button>

          <!-- Add Set button -->
          <button
            v-if="editable"
            type="button"
            class="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-xs text-slate-600 transition-colors hover:text-slate-400"
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

<style scoped>
.adhoc-grid {
  display: grid;
  grid-template-columns: 0.5fr 1.5fr 1fr 0.75fr;
  align-items: center;
}
</style>
