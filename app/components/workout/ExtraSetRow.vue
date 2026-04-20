<script setup lang="ts">
import type { CompletedSetRecord } from '~/types/workout'

const props = defineProps<{
  setNumber: number
  completedSet: CompletedSetRecord
  loading: boolean
  editable: boolean
}>()

defineEmits<{
  edit: []
}>()
</script>

<template>
  <div
    class="extra-set-row transition-colors"
    :class="[
      editable ? 'cursor-pointer hover:bg-slate-700/40 active:bg-slate-700/60' : '',
      loading ? 'opacity-50' : '',
    ]"
    :role="editable ? 'button' : undefined"
    :tabindex="editable ? 0 : undefined"
    @click="editable && $emit('edit')"
    @keydown.enter="editable && $emit('edit')"
    @keydown.space.prevent="editable && $emit('edit')"
  >
    <span class="text-center text-xs font-medium text-slate-500">{{ setNumber }}</span>
    <span class="text-center text-sm font-semibold text-green-400">{{ completedSet.weight != null ? `${completedSet.weight}` : '—' }}</span>
    <span class="text-center text-sm font-semibold text-green-400">{{ completedSet.reps != null ? completedSet.reps : '—' }}</span>
    <span class="text-center text-xs text-slate-600">—</span>
    <span class="flex items-center justify-center">
      <UIcon name="i-lucide-check-circle" class="size-4 text-green-500" />
    </span>
  </div>
</template>

<style scoped>
.extra-set-row {
  display: grid;
  grid-template-columns: 0.5fr 1.5fr 1fr 1.5fr 0.75fr;
  align-items: center;
  padding: 0.5rem 0;
}
</style>
