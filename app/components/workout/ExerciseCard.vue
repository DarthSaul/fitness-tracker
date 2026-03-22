<script setup lang="ts">
import type { ExerciseGroupDetail } from '~/types/program'
import type { CompletedSetRecord } from '~/types/workout'

const props = defineProps<{
  group: ExerciseGroupDetail
  completedSets: Map<string, CompletedSetRecord>
  editable: boolean
  editingSetId: string | null
  recordingSetId: string | null
}>()

const emit = defineEmits<{
  log: [exerciseSetId: string, reps: number | null, weight: number | null]
  edit: [exerciseSetId: string]
  cancelEdit: []
  deleteSet: [exerciseSetId: string]
}>()

const expandedExercises = ref(new Set<string>())
const notesVisibleFor = ref<string | null>(null)

function exerciseNotes(ex: ExerciseGroupDetail['exercises'][number]): string | null {
  const unique = [...new Set(ex.sets.map(s => s.notes).filter((n): n is string => n != null))]
  return unique.length ? unique.join(' / ') : null
}

function toggleNotes(exId: string, event: Event): void {
  event.stopPropagation()
  notesVisibleFor.value = notesVisibleFor.value === exId ? null : exId
}

function toggleExercise(id: string): void {
  if (expandedExercises.value.has(id)) {
    expandedExercises.value.delete(id)
  } else {
    expandedExercises.value.add(id)
  }
}

function isSetCompleted(exerciseSetId: string): boolean {
  return props.completedSets.has(exerciseSetId)
}

function getCompletedSet(exerciseSetId: string): CompletedSetRecord | null {
  return props.completedSets.get(exerciseSetId) ?? null
}

function handleLog(exerciseSetId: string, reps: number | null, weight: number | null): void {
  emit('log', exerciseSetId, reps, weight)
}
</script>

<template>
  <!-- Superset wrapper -->
  <div
    v-if="group.type === 'SUPERSET'"
    class="relative rounded-xl border border-indigo-500/25 p-1.5 pt-2"
  >
    <span class="absolute -left-2 -top-2 flex size-5 items-center justify-center rounded-full border border-indigo-500/40 bg-slate-950 text-[8px] font-semibold text-indigo-300">SS</span>
    <div class="space-y-1.5">
      <div
        v-for="(ex, exIdx) in group.exercises"
        :key="ex.id"
        class="rounded-lg bg-slate-800/50"
      >
        <button
          class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left"
          @click="toggleExercise(ex.id)"
        >
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-1.5 font-medium text-white">
              {{ ex.exercise.name }}
              <span
                v-if="exerciseNotes(ex)"
                class="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-slate-600 text-[9px] text-slate-400"
                @click="toggleNotes(ex.id, $event)"
              >i</span>
            </p>
            <span v-if="exIdx === group.exercises.length - 1" class="mt-1 block text-xs text-slate-500">
              Rest: {{ group.restSeconds ?? 120 }}s
            </span>
          </div>
          <UIcon
            :name="expandedExercises.has(ex.id) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            class="size-6 shrink-0 text-slate-400"
          />
        </button>

        <!-- Notes box -->
        <div v-if="notesVisibleFor === ex.id && exerciseNotes(ex)" class="mx-3 mb-2 rounded-md bg-slate-700/50 px-3 py-2 text-xs text-slate-300">
          {{ exerciseNotes(ex) }}
        </div>

        <div
          class="grid overflow-hidden transition-all duration-200 ease-in-out"
          :class="expandedExercises.has(ex.id) ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
        >
          <div class="min-h-0">
            <div class="border-t border-slate-700/50 px-3 pb-3 pt-2">
              <div class="space-y-1.5">
                <WorkoutSetRow
                  v-for="set in ex.sets"
                  :key="set.id"
                  :set="set"
                  :completed-set="getCompletedSet(set.id)"
                  :editing="editingSetId === set.id"
                  :loading="recordingSetId === set.id"
                  :editable="editable"
                  @log="(reps, weight) => handleLog(set.id, reps, weight)"
                  @edit="emit('edit', set.id)"
                  @cancel="emit('cancelEdit')"
                  @delete="emit('deleteSet', set.id)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Standard (single exercise) card -->
  <div
    v-else
    class="rounded-lg bg-slate-800/50"
  >
    <button
      class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left"
      @click="toggleExercise(group.id)"
    >
      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-1.5 font-medium text-white">
          {{ group.exercises[0]?.exercise.name }}
          <span
            v-if="group.exercises[0] && exerciseNotes(group.exercises[0])"
            class="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-slate-600 text-[9px] text-slate-400"
            @click="toggleNotes(group.exercises[0].id, $event)"
          >i</span>
        </p>
        <span class="mt-1 block text-xs text-slate-500">
          Rest: {{ group.restSeconds ?? 120 }}s
        </span>
      </div>
      <UIcon
        :name="expandedExercises.has(group.id) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="size-6 shrink-0 text-slate-400"
      />
    </button>

    <!-- Notes box -->
    <div v-if="group.exercises[0] && notesVisibleFor === group.exercises[0].id && exerciseNotes(group.exercises[0])" class="mx-3 mb-2 rounded-md bg-slate-700/50 px-3 py-2 text-xs text-slate-300">
      {{ exerciseNotes(group.exercises[0]) }}
    </div>

    <div
      class="grid overflow-hidden transition-all duration-200 ease-in-out"
      :class="expandedExercises.has(group.id) ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
    >
      <div class="min-h-0">
        <div class="border-t border-slate-700/50 px-3 pb-3 pt-2">
          <div class="space-y-1.5">
            <WorkoutSetRow
              v-for="set in group.exercises[0]?.sets"
              :key="set.id"
              :set="set"
              :completed-set="getCompletedSet(set.id)"
              :editing="editingSetId === set.id"
              :loading="recordingSetId === set.id"
              :editable="editable"
              @log="(reps, weight) => handleLog(set.id, reps, weight)"
              @edit="emit('edit', set.id)"
              @cancel="emit('cancelEdit')"
              @delete="emit('deleteSet', set.id)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
