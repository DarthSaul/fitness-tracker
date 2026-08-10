/**
 * Renders a single prescribed set as pending or completed. Tapping either state
 * emits 'edit' so the parent can open the SetLogDrawer.
 */
<script setup lang="ts">
import type { ExerciseSetDetail } from '~/types/program'
import type { CompletedSetRecord } from '~/types/workout'

const props = defineProps<{
  set: ExerciseSetDetail
  completedSet: CompletedSetRecord | null
  loading: boolean
  editable: boolean
  isSwapped?: boolean
}>()

const emit = defineEmits<{
  edit: []
}>()

function startEditing(): void {
  if (!props.editable) return
  emit('edit')
}

function formatWeight(w: number | null | undefined): string {
  if (w == null) return '—'
  return `${w}`
}

function formatEffort(effortTarget: string | null | undefined): string {
  if (!effortTarget) return '—'
  const match = effortTarget.match(/^([\d.]+%)/)
  return match?.[1] ?? effortTarget
}
</script>

<template>
  <!-- Completed set — logged values read green throughout, per the iOS card -->
  <div
    v-if="completedSet"
    data-testid="set-row"
    class="grid cursor-pointer grid-cols-5 select-none items-center py-2 text-subheadline tnum transition-colors hover:bg-label-secondary/10 active:bg-label-secondary/20"
    :class="{ 'opacity-50': loading }"
    @click="startEditing"
    @contextmenu.prevent
  >
    <span class="text-center text-caption font-medium text-ios-green">{{ set.setNumber }}</span>
    <span class="text-center text-ios-green">{{ formatWeight(completedSet.weight) }}</span>
    <span class="text-center text-ios-green">{{ completedSet.reps ?? '—' }}</span>
    <span class="text-center text-caption text-label-tertiary">{{ formatEffort(set.effortTarget) }}</span>
    <span class="flex items-center justify-center">
      <UIcon name="i-lucide-check" class="size-4 text-ios-green" />
    </span>
  </div>

  <!-- Pending set -->
  <div
    v-else
    data-testid="set-row"
    class="grid cursor-pointer grid-cols-5 items-center py-2 text-subheadline tnum transition-colors hover:bg-label-secondary/10 active:bg-label-secondary/20"
    :class="{ 'opacity-50': loading }"
    @click="startEditing"
  >
    <span class="text-center text-caption font-medium text-label-secondary">{{ set.setNumber }}</span>
    <span class="text-center text-label">{{ isSwapped ? '—' : formatWeight(set.weight) }}</span>
    <span class="text-center text-label">{{ isSwapped ? '—' : (set.reps ?? '—') }}</span>
    <span class="text-center text-caption text-label-tertiary">{{ isSwapped ? '—' : formatEffort(set.effortTarget) }}</span>
    <span class="flex items-center justify-center gap-0.5">
      <UIcon name="i-lucide-circle-dashed" class="size-4 text-label-tertiary" />
      <span v-if="set.notes" class="text-caption text-label-tertiary" :title="set.notes">*</span>
    </span>
  </div>
</template>
