/**
 * Displays a single exercise group within a workout session, handling both standard and superset
 * layouts with collapsible set rows, inline notes, and rest-time display.
 */
<script setup lang="ts">
import type { ExerciseGroupDetail } from '~/types/program'
import type { WorkoutExerciseSwap, CompletedSetRecord, EditingContext } from '~/types/workout'

const props = defineProps<{
  group: ExerciseGroupDetail
  completedSets: Map<string, CompletedSetRecord>
  extraCompletedSets: Map<string, CompletedSetRecord>
  exerciseSwaps: WorkoutExerciseSwap[]
  editable: boolean
  recordingSetId: string | null
  disableExtraSets?: boolean
  disableExerciseSwaps?: boolean
}>()

const emit = defineEmits<{
  edit: [context: EditingContext]
  'add-extra-set': [programExerciseId: string]
  swap: [programExerciseId: string]
}>()

const expandedExercises = ref(new Set<string>())
const notesVisibleFor = ref<string | null>(null)

// Per-user exercise notes state
const userNotesOpen = ref<string | null>(null)  // ProgramExercise.id currently open
const userNotesContent = ref<Record<string, string>>({})  // exerciseId → text
const userNotesSaving = ref<Record<string, boolean>>({})
const userNotesLoaded = ref(new Set<string>())  // exerciseIds fetched
const userNotesLoading = ref(new Set<string>())

function exerciseNotes(ex: ExerciseGroupDetail['exercises'][number]): string | null {
  const trimmed = ex.sets.map(s => s.notes?.trim()).filter((n): n is string => !!n)
  const unique = [...new Set(trimmed)]
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

function isExerciseComplete(ex: ExerciseGroupDetail['exercises'][number]): boolean {
  return ex.sets.length > 0 && ex.sets.every(set => props.completedSets.has(set.id))
}

function formatRest(seconds: number | null): string {
  const s = seconds ?? 120
  if (s < 60) return `${s}s`
  const min = s / 60
  return Number.isInteger(min) ? `${min} min` : `${min} min`
}

function getExtraCompletedSets(programExerciseId: string): CompletedSetRecord[] {
  return [...props.extraCompletedSets.values()]
    .filter(cs => cs.programExerciseId === programExerciseId)
}

function hasSwap(programExerciseId: string): boolean {
  return props.exerciseSwaps.some(s => s.programExerciseId === programExerciseId)
}

async function toggleUserNotes(exerciseId: string, programExerciseId: string): Promise<void> {
  if (userNotesOpen.value === programExerciseId) {
    userNotesOpen.value = null
    return
  }
  userNotesOpen.value = programExerciseId
  expandedExercises.value.add(props.group.type === 'SUPERSET' ? programExerciseId : props.group.id)
  if (!userNotesLoaded.value.has(exerciseId)) {
    userNotesLoading.value.add(exerciseId)
    try {
      const data = await $fetch<{ notes: string | null }>(`/api/exercises/${exerciseId}/notes`)
      userNotesContent.value[exerciseId] = data.notes ?? ''
      userNotesLoaded.value.add(exerciseId)
    } catch {
      // leave userNotesContent unchanged; do not mark as loaded
    } finally {
      userNotesLoading.value.delete(exerciseId)
    }
  }
}

const notesDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

async function saveUserNotes(exerciseId: string, notes: string): Promise<void> {
  if (!userNotesLoaded.value.has(exerciseId)) return
  userNotesContent.value = { ...userNotesContent.value, [exerciseId]: notes }
  const prev = notesDebounceTimers.get(exerciseId)
  if (prev) clearTimeout(prev)
  notesDebounceTimers.set(exerciseId, setTimeout(async () => {
    notesDebounceTimers.delete(exerciseId)
    userNotesSaving.value = { ...userNotesSaving.value, [exerciseId]: true }
    try {
      await $fetch(`/api/exercises/${exerciseId}/notes`, { method: 'PUT', body: { notes } })
    } finally {
      userNotesSaving.value = { ...userNotesSaving.value, [exerciseId]: false }
    }
  }, 800))
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
        <div
          role="button"
          tabindex="0"
          class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left"
          @click="toggleExercise(ex.id)"
          @keydown.enter="toggleExercise(ex.id)"
          @keydown.space.prevent="toggleExercise(ex.id)"
        >
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-1.5 font-medium text-white">
              {{ ex.exercise.name }}
              <!-- Program set notes icon -->
              <span
                v-if="exerciseNotes(ex)"
                role="button"
                tabindex="0"
                aria-label="Toggle notes"
                class="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-slate-600 text-[9px] text-slate-400"
                @click="toggleNotes(ex.id, $event)"
                @keydown.enter="toggleNotes(ex.id, $event)"
              >i</span>
              <!-- Personal notes icon -->
              <button
                type="button"
                :aria-label="userNotesOpen === ex.id ? 'Close personal notes' : 'Open personal notes'"
                class="ml-1.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors"
                :class="userNotesContent[ex.exercise.id]
                  ? 'border-violet-500/60 text-violet-400'
                  : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'"
                @click.stop="toggleUserNotes(ex.exercise.id, ex.id)"
              >
                <UIcon name="i-lucide-notebook-pen" class="size-2.5" />
              </button>
              <!-- Swap icon -->
              <button
                v-if="editable && !disableExerciseSwaps"
                type="button"
                :aria-label="hasSwap(ex.id) ? 'Change swapped exercise' : 'Swap exercise'"
                class="ml-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors"
                :class="hasSwap(ex.id)
                  ? 'border-amber-500/60 text-amber-400'
                  : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'"
                @click.stop="emit('swap', ex.id)"
              >
                <UIcon name="i-lucide-arrow-left-right" class="size-2.5" />
              </button>
            </p>
            <span v-if="exIdx === group.exercises.length - 1" class="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-slate-700/50 px-1.5 py-0.5 text-[10px] text-slate-400">
              <span>⏱️</span><span>{{ formatRest(group.restSeconds) }}</span>
            </span>
          </div>
          <UIcon
            v-if="isExerciseComplete(ex)"
            name="i-lucide-check-circle-2"
            class="size-5 shrink-0 text-emerald-400"
          />
          <UIcon
            :name="expandedExercises.has(ex.id) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            class="size-6 shrink-0 text-slate-400"
          />
        </div>

        <!-- Program notes box -->
        <div v-if="notesVisibleFor === ex.id && exerciseNotes(ex)" class="mx-3 mb-2 rounded-md bg-slate-700/50 px-3 py-2 text-xs text-slate-300">
          {{ exerciseNotes(ex) }}
        </div>

        <div
          class="grid overflow-hidden transition-all duration-200 ease-in-out"
          :class="expandedExercises.has(ex.id) ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
        >
          <div class="min-h-0">
            <div class="border-t border-slate-700/50 px-3 pb-3 pt-2">
              <!-- Inline personal notes -->
              <div v-if="userNotesOpen === ex.id" class="mx-1 mb-2 mt-1">
                <div v-if="userNotesLoading.has(ex.exercise.id)" class="h-16 animate-pulse rounded-lg bg-slate-800" />
                <template v-else>
                  <textarea
                    :value="userNotesContent[ex.exercise.id] ?? ''"
                    rows="3"
                    placeholder="Your personal notes for this exercise..."
                    class="w-full resize-none rounded-md bg-slate-700/50 px-3 py-2 text-base text-slate-200 placeholder-slate-600 outline-none focus:ring-1 focus:ring-slate-600"
                    @input="saveUserNotes(ex.exercise.id, ($event.target as HTMLTextAreaElement).value)"
                    @blur="saveUserNotes(ex.exercise.id, ($event.target as HTMLTextAreaElement).value)"
                  />
                  <p v-if="userNotesSaving[ex.exercise.id]" class="mt-0.5 text-right text-xs text-slate-600">
                    Saving...
                  </p>
                </template>
              </div>

              <div class="set-grid pb-2 text-[10px] uppercase tracking-wider text-slate-500">
                <span class="text-center font-medium">#</span>
                <span class="text-center font-medium">lb</span>
                <span class="text-center font-medium">Reps</span>
                <span class="text-center font-medium">Effort</span>
                <span class="text-center font-medium">Done</span>
              </div>
              <div>
                <WorkoutSetRow
                  v-for="set in ex.sets"
                  :key="set.id"
                  :set="set"
                  :completed-set="getCompletedSet(set.id)"
                  :loading="recordingSetId === set.id"
                  :editable="editable"
                  @edit="emit('edit', { type: 'template', exerciseSetId: set.id })"
                />
                <!-- Extra sets -->
                <WorkoutExtraSetRow
                  v-for="(extraSet, idx) in getExtraCompletedSets(ex.id)"
                  :key="extraSet.id"
                  :set-number="ex.sets.length + idx + 1"
                  :completed-set="extraSet"
                  :loading="recordingSetId === extraSet.id"
                  :editable="editable"
                  @edit="emit('edit', { type: 'extra', completedSetId: extraSet.id, programExerciseId: ex.id })"
                />
              </div>
              <!-- Add Set button -->
              <button
                v-if="editable && !disableExtraSets"
                type="button"
                class="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-xs text-slate-600 transition-colors hover:text-slate-400"
                @click.stop="emit('add-extra-set', ex.id)"
              >
                <UIcon name="i-lucide-plus" class="size-3" />
                Add Set
              </button>
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
    <template v-if="group.exercises[0]">
      <div
        role="button"
        tabindex="0"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left"
        @click="toggleExercise(group.id)"
        @keydown.enter="toggleExercise(group.id)"
        @keydown.space.prevent="toggleExercise(group.id)"
      >
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-1.5 font-medium text-white">
            {{ group.exercises[0].exercise.name }}
            <!-- Program set notes icon -->
            <span
              v-if="exerciseNotes(group.exercises[0])"
              role="button"
              tabindex="0"
              aria-label="Toggle notes"
              class="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-slate-600 text-[9px] text-slate-400"
              @click="toggleNotes(group.exercises[0].id, $event)"
              @keydown.enter="toggleNotes(group.exercises[0].id, $event)"
            >i</span>
            <!-- Personal notes icon -->
            <button
              type="button"
              :aria-label="userNotesOpen === group.exercises[0].id ? 'Close personal notes' : 'Open personal notes'"
              class="ml-1.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors"
              :class="userNotesContent[group.exercises[0].exercise.id]
                ? 'border-violet-500/60 text-violet-400'
                : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'"
              @click.stop="toggleUserNotes(group.exercises[0].exercise.id, group.exercises[0].id)"
            >
              <UIcon name="i-lucide-notebook-pen" class="size-2.5" />
            </button>
            <!-- Swap icon -->
            <button
              v-if="editable && !disableExerciseSwaps"
              type="button"
              :aria-label="hasSwap(group.exercises[0].id) ? 'Change swapped exercise' : 'Swap exercise'"
              class="ml-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors"
              :class="hasSwap(group.exercises[0].id)
                ? 'border-amber-500/60 text-amber-400'
                : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'"
              @click.stop="emit('swap', group.exercises[0].id)"
            >
              <UIcon name="i-lucide-arrow-left-right" class="size-2.5" />
            </button>
          </p>
          <span class="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-slate-700/50 px-1.5 py-0.5 text-[10px] text-slate-400">
            <span>⏱️</span><span>{{ formatRest(group.restSeconds) }}</span>
          </span>
        </div>
        <UIcon
          v-if="isExerciseComplete(group.exercises[0])"
          name="i-lucide-check-circle-2"
          class="size-5 shrink-0 text-emerald-400"
        />
        <UIcon
          :name="expandedExercises.has(group.id) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          class="size-6 shrink-0 text-slate-400"
        />
      </div>

      <!-- Program notes box -->
      <div v-if="notesVisibleFor === group.exercises[0].id && exerciseNotes(group.exercises[0])" class="mx-3 mb-2 rounded-md bg-slate-700/50 px-3 py-2 text-xs text-slate-300">
        {{ exerciseNotes(group.exercises[0]) }}
      </div>

      <div
        class="grid overflow-hidden transition-all duration-200 ease-in-out"
        :class="expandedExercises.has(group.id) ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
      >
        <div class="min-h-0">
          <div class="border-t border-slate-700/50 px-3 pb-3 pt-2">
            <!-- Inline personal notes -->
            <div v-if="userNotesOpen === group.exercises[0].id" class="mx-1 mb-2 mt-1">
              <div v-if="userNotesLoading.has(group.exercises[0].exercise.id)" class="h-16 animate-pulse rounded-lg bg-slate-800" />
              <template v-else>
                <textarea
                  :value="userNotesContent[group.exercises[0].exercise.id] ?? ''"
                  rows="3"
                  placeholder="Your personal notes for this exercise..."
                  class="w-full resize-none rounded-md bg-slate-700/50 px-3 py-2 text-base text-slate-200 placeholder-slate-600 outline-none focus:ring-1 focus:ring-slate-600"
                  @input="saveUserNotes(group.exercises[0].exercise.id, ($event.target as HTMLTextAreaElement).value)"
                  @blur="saveUserNotes(group.exercises[0].exercise.id, ($event.target as HTMLTextAreaElement).value)"
                />
                <p v-if="userNotesSaving[group.exercises[0].exercise.id]" class="mt-0.5 text-right text-xs text-slate-600">
                  Saving...
                </p>
              </template>
            </div>

            <div class="set-grid pb-2 text-[10px] uppercase tracking-wider text-slate-500">
              <span class="text-center font-medium">#</span>
              <span class="text-center font-medium">lb</span>
              <span class="text-center font-medium">Reps</span>
              <span class="text-center font-medium">Effort</span>
              <span class="text-center font-medium">Done</span>
            </div>
            <div>
              <WorkoutSetRow
                v-for="set in group.exercises[0].sets"
                :key="set.id"
                :set="set"
                :completed-set="getCompletedSet(set.id)"
                :loading="recordingSetId === set.id"
                :editable="editable"
                @edit="emit('edit', { type: 'template', exerciseSetId: set.id })"
              />
              <!-- Extra sets -->
              <WorkoutExtraSetRow
                v-for="(extraSet, idx) in getExtraCompletedSets(group.exercises[0].id)"
                :key="extraSet.id"
                :set-number="group.exercises[0].sets.length + idx + 1"
                :completed-set="extraSet"
                :loading="recordingSetId === extraSet.id"
                :editable="editable"
                @edit="emit('edit', { type: 'extra', completedSetId: extraSet.id, programExerciseId: group.exercises[0].id })"
              />
            </div>
            <!-- Add Set button -->
            <button
              v-if="editable && !disableExtraSets"
              type="button"
              class="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-xs text-slate-600 transition-colors hover:text-slate-400"
              @click.stop="emit('add-extra-set', group.exercises[0].id)"
            >
              <UIcon name="i-lucide-plus" class="size-3" />
              Add Set
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.set-grid {
  display: grid;
  grid-template-columns: 0.5fr 1.5fr 1fr 1.5fr 0.75fr;
  align-items: center;
}
</style>
