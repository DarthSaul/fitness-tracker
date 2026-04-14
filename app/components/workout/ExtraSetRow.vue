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
    class="grid cursor-pointer items-center gap-2 rounded-md px-2 py-2 transition-colors"
    :class="[
      editable ? 'hover:bg-slate-700/40 active:bg-slate-700/60' : '',
      loading ? 'opacity-50' : '',
    ]"
    style="grid-template-columns: 0.5fr 1.5fr 1fr 1.5fr 0.75fr"
    :role="editable ? 'button' : undefined"
    :tabindex="editable ? 0 : undefined"
    @click="editable && $emit('edit')"
    @keydown.enter="editable && $emit('edit')"
    @keydown.space.prevent="editable && $emit('edit')"
  >
    <span class="text-xs font-medium text-slate-500">{{ setNumber }}</span>
    <span class="text-sm font-semibold text-green-400">
      {{ completedSet.weight != null ? `${completedSet.weight}` : '—' }}
    </span>
    <span class="text-sm font-semibold text-green-400">
      {{ completedSet.reps != null ? completedSet.reps : '—' }}
    </span>
    <span class="text-xs text-slate-600">—</span>
    <div class="flex justify-end">
      <UIcon name="i-lucide-check-circle" class="size-4 text-green-500" />
    </div>
  </div>
</template>
