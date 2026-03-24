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
  <!-- Completed set -->
  <div
    v-if="completedSet"
    class="set-row select-none cursor-pointer text-sm transition-colors hover:bg-slate-700/50 active:bg-slate-700"
    :class="{ 'opacity-50': loading }"
    @click="startEditing"
    @contextmenu.prevent
  >
    <span class="text-center text-xs font-medium text-emerald-400">{{ set.setNumber }}</span>
    <span class="text-center text-emerald-300">{{ formatWeight(completedSet.weight) }}</span>
    <span class="text-center text-emerald-300">{{ completedSet.reps ?? '—' }}</span>
    <span class="text-center text-xs text-emerald-300/70">{{ formatEffort(set.effortTarget) }}</span>
    <span class="flex items-center justify-center">
      <UIcon name="i-lucide-check" class="size-4 text-emerald-400" />
    </span>
  </div>

  <!-- Pending set -->
  <div
    v-else
    class="set-row cursor-pointer text-sm transition-colors hover:bg-slate-700/50 active:bg-slate-700"
    :class="{ 'opacity-50': loading }"
    @click="startEditing"
  >
    <span class="text-center text-xs font-medium text-slate-500">{{ set.setNumber }}</span>
    <span class="text-center text-slate-300">{{ formatWeight(set.weight) }}</span>
    <span class="text-center text-slate-300">{{ set.reps ?? '—' }}</span>
    <span class="text-center text-xs text-slate-400">{{ formatEffort(set.effortTarget) }}</span>
    <span class="flex items-center justify-center">
      <span v-if="set.notes" class="text-xs text-slate-600" :title="set.notes">*</span>
    </span>
  </div>
</template>

<style scoped>
.set-row {
  display: grid;
  grid-template-columns: 0.5fr 1.5fr 1fr 1.5fr 0.75fr;
  align-items: center;
  padding: 0.5rem 0;
}
</style>
