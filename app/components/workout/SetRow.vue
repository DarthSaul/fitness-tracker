/**
 * Renders a single prescribed set as pending, editing, or completed, with long-press support
 * to reveal edit and delete actions on completed sets.
 */
<script setup lang="ts">
import type { ExerciseSetDetail } from '~/types/program'
import type { CompletedSetRecord } from '~/types/workout'

const props = defineProps<{
  set: ExerciseSetDetail
  completedSet: CompletedSetRecord | null
  editing: boolean
  loading: boolean
  editable: boolean
}>()

const emit = defineEmits<{
  log: [reps: number | null, weight: number | null]
  edit: []
  cancel: []
  delete: []
}>()

const editReps = ref<number | null>(null)
const editWeight = ref<number | null>(null)

// Long-press state for editable completed sets
const longPressTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const showActions = ref(false)

function startEditing(): void {
  editReps.value = props.completedSet?.reps ?? props.set.reps
  editWeight.value = props.completedSet?.weight ?? props.set.weight
  emit('edit')
}

function handleLog(): void {
  const reps = Number.isFinite(editReps.value) ? editReps.value : null
  const weight = Number.isFinite(editWeight.value) ? editWeight.value : null
  emit('log', reps, weight)
}

function clearLongPress(): void {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
}

function onTouchStart(): void {
  if (!props.editable || !props.completedSet) return
  clearLongPress()
  longPressTimer.value = setTimeout(() => {
    longPressTimer.value = null
    showActions.value = true
  }, 500)
}

function onTouchEnd(): void {
  clearLongPress()
}

function onTouchMove(): void {
  clearLongPress()
}

function handleEdit(): void {
  showActions.value = false
  startEditing()
}

function handleDelete(): void {
  showActions.value = false
  emit('delete')
}

function dismissActions(): void {
  showActions.value = false
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
    v-if="completedSet && !editing"
    class="set-row relative text-sm"
    @touchstart.passive="onTouchStart"
    @touchend="onTouchEnd"
    @touchmove="onTouchMove"
    @contextmenu.prevent
  >
    <span class="text-center text-xs font-medium text-emerald-400">{{ set.setNumber }}</span>
    <span class="text-center text-emerald-300">{{ formatWeight(completedSet.weight) }}</span>
    <span class="text-center text-emerald-300">{{ completedSet.reps ?? '—' }}</span>
    <span class="text-center text-xs text-emerald-300/70">{{ formatEffort(set.effortTarget) }}</span>
    <span class="flex items-center justify-center">
      <UIcon name="i-lucide-check" class="size-4 text-emerald-400" />
    </span>

    <!-- Long-press action overlay -->
    <div
      v-if="showActions"
      class="absolute inset-0 z-10 flex items-center justify-end gap-2 rounded-md bg-slate-800/95 px-3"
    >
      <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-pencil" @click="handleEdit">
        Edit
      </UButton>
      <UButton size="xs" color="error" variant="soft" icon="i-lucide-trash-2" @click="handleDelete">
        Delete
      </UButton>
      <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" @click="dismissActions" />
    </div>
  </div>

  <!-- Editing set -->
  <div v-else-if="editing" class="col-span-5">
    <div class="rounded-md bg-slate-700/50 px-3 py-2">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-xs font-medium text-slate-400">Set {{ set.setNumber }}</span>
        <button class="text-slate-500 hover:text-slate-300" @click="emit('cancel')">
          <UIcon name="i-lucide-x" class="size-4" />
        </button>
      </div>
      <div class="flex items-end gap-2">
        <div class="flex-1">
          <label class="mb-0.5 block text-xs text-slate-500">Weight</label>
          <input
            v-model.number="editWeight"
            type="number"
            inputmode="decimal"
            step="any"
            class="w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-white outline-none ring-1 ring-slate-600 focus:ring-violet-500"
            placeholder="lbs"
          >
        </div>
        <div class="flex-1">
          <label class="mb-0.5 block text-xs text-slate-500">Reps</label>
          <input
            v-model.number="editReps"
            type="number"
            inputmode="numeric"
            class="w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-white outline-none ring-1 ring-slate-600 focus:ring-violet-500"
            placeholder="reps"
          >
        </div>
      </div>
      <div class="mt-2">
        <UButton color="primary" size="xs" block class="rounded-sm" :loading="loading" @click="handleLog">
          Log
        </UButton>
      </div>
    </div>
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
  padding: 0.375rem 0;
}
</style>
