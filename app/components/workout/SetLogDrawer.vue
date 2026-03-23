/**
 * Bottom sheet drawer for logging a workout set with large, thumb-friendly inputs.
 * Replaces the cramped inline editing form to prevent iOS auto-zoom and improve mobile UX.
 */
<script setup lang="ts">
import type { ExerciseSetDetail } from '~/types/program'
import type { CompletedSetRecord } from '~/types/workout'

const props = defineProps<{
  set: ExerciseSetDetail
  completedSet: CompletedSetRecord | null
  open: boolean
  loading: boolean
}>()

const emit = defineEmits<{
  log: [reps: number | null, weight: number | null]
  close: []
}>()

const editWeight = ref<number | null>(null)
const editReps = ref<number | null>(null)
const weightInputRef = ref<HTMLInputElement | null>(null)

// Sync drawer open state with prop, emit close when dismissed
const isOpen = computed({
  get: () => props.open,
  set: (v: boolean) => {
    if (!v) emit('close')
  },
})

// Reset form values when drawer opens
watch(() => props.open, async (opened) => {
  if (opened) {
    editWeight.value = props.completedSet?.weight ?? props.set.weight
    editReps.value = props.completedSet?.reps ?? props.set.reps
    await nextTick()
    weightInputRef.value?.focus()
  }
})

function handleLog(): void {
  const weight = Number.isFinite(editWeight.value) ? editWeight.value : null
  const reps = Number.isFinite(editReps.value) ? editReps.value : null
  emit('log', reps, weight)
}

function formatTarget(): string {
  const parts: string[] = []
  if (props.set.weight != null) parts.push(`${props.set.weight} lbs`)
  if (props.set.reps != null) parts.push(`${props.set.reps} reps`)
  if (parts.length === 0) return ''
  let target = parts.join(' \u00d7 ')
  if (props.set.effortTarget) target += ` at ${props.set.effortTarget}`
  return target
}
</script>

<template>
  <UDrawer v-model:open="isOpen" direction="bottom">
    <template #content>
      <div class="mx-auto w-full max-w-lg px-5 pb-8 pt-4">
        <!-- Header -->
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-white">
            Set {{ set.setNumber }}
          </h3>
          <button
            class="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            aria-label="Close"
            @click="emit('close')"
          >
            <UIcon name="i-lucide-x" class="size-5" />
          </button>
        </div>

        <!-- Target context -->
        <p v-if="formatTarget()" class="mb-5 text-sm text-slate-400">
          Target: {{ formatTarget() }}
        </p>

        <!-- Inputs -->
        <div class="mb-5 flex gap-4">
          <div class="flex-1">
            <label for="drawer-weight" class="mb-1.5 block text-sm font-medium text-slate-300">
              Weight (lbs)
            </label>
            <input
              id="drawer-weight"
              ref="weightInputRef"
              v-model.number="editWeight"
              type="number"
              inputmode="decimal"
              step="any"
              placeholder="0"
              class="w-full rounded-lg bg-slate-800 px-4 py-3 text-lg text-white outline-none ring-1 ring-slate-700 transition-shadow focus:ring-2 focus:ring-violet-500"
            >
          </div>
          <div class="flex-1">
            <label for="drawer-reps" class="mb-1.5 block text-sm font-medium text-slate-300">
              Reps
            </label>
            <input
              id="drawer-reps"
              v-model.number="editReps"
              type="number"
              inputmode="numeric"
              :placeholder="set.reps != null ? String(set.reps) : '0'"
              class="w-full rounded-lg bg-slate-800 px-4 py-3 text-lg text-white outline-none ring-1 ring-slate-700 transition-shadow focus:ring-2 focus:ring-violet-500"
            >
          </div>
        </div>

        <!-- Submit -->
        <UButton
          color="primary"
          size="lg"
          block
          class="py-5 text-base"
          :loading="loading"
          @click="handleLog"
        >
          Log Set
        </UButton>
      </div>
    </template>
  </UDrawer>
</template>
