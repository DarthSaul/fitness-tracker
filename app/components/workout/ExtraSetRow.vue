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
    class="grid grid-cols-5 items-center py-2 tnum transition-colors"
    :class="[
      editable ? 'cursor-pointer hover:bg-label-secondary/10 active:bg-label-secondary/20' : '',
      loading ? 'opacity-50' : '',
    ]"
    :role="editable ? 'button' : undefined"
    :tabindex="editable ? 0 : undefined"
    @click="editable && $emit('edit')"
    @keydown.enter="editable && $emit('edit')"
    @keydown.space.prevent="editable && $emit('edit')"
  >
    <!-- Orange set number marks this as an extra set rather than a prescribed one -->
    <span class="text-center text-caption font-medium text-ios-orange">{{ setNumber }}</span>
    <span class="text-center text-subheadline font-semibold text-ios-green">{{ completedSet.weight != null ? `${completedSet.weight}` : '—' }}</span>
    <span class="text-center text-subheadline font-semibold text-ios-green">{{ completedSet.reps != null ? completedSet.reps : '—' }}</span>
    <span class="text-center text-caption text-label-tertiary">—</span>
    <span class="flex items-center justify-center">
      <UIcon name="i-lucide-check" class="size-4 text-ios-green" />
    </span>
  </div>
</template>
