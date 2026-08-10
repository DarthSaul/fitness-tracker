<!--
  PT Routines management page: list, create, edit, and delete the user's
  PT routines. Routine content is edited in the PtRoutineEditorDrawer and
  saved atomically (name + full exercise list).
-->
<script setup lang="ts">
import type { PtRoutine, PtRoutineExerciseInput } from '~/types/pt-routine'

definePageMeta({ layout: 'app', header: { title: 'PT Routines', style: 'inline' } })

const { routines, status, saving, createRoutine, updateRoutine, deleteRoutine, isDeleting } = usePtRoutines()

const editorOpen = ref(false)
const editingRoutine = ref<PtRoutine | null>(null)
const deleteTarget = ref<PtRoutine | null>(null)
const errorMessage = ref<string | null>(null)

const deleteDialogOpen = computed({
  get: () => deleteTarget.value !== null,
  set: (v: boolean) => {
    if (!v) deleteTarget.value = null
  },
})

function openCreate(): void {
  editingRoutine.value = null
  editorOpen.value = true
}

function openEdit(routine: PtRoutine): void {
  editingRoutine.value = routine
  editorOpen.value = true
}

function requestDelete(routine: PtRoutine): void {
  deleteTarget.value = routine
}

function cancelDelete(): void {
  deleteTarget.value = null
}

async function handleSave(payload: { name: string; exercises: PtRoutineExerciseInput[] }): Promise<void> {
  errorMessage.value = null
  try {
    if (editingRoutine.value) {
      await updateRoutine(editingRoutine.value.id, payload)
    } else {
      await createRoutine(payload.name, payload.exercises)
    }
    editorOpen.value = false
  } catch {
    errorMessage.value = 'Failed to save routine. Please try again.'
  }
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value
  if (!target) return

  errorMessage.value = null
  try {
    await deleteRoutine(target.id)
  } catch {
    errorMessage.value = 'Failed to delete routine. Please try again.'
  } finally {
    deleteTarget.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-end">
      <UButton
        icon="i-lucide-plus"
        color="primary"
        size="sm"
        @click="openCreate"
      >
        New Routine
      </UButton>
    </div>

    <!-- Error -->
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
    />

    <!-- Loading skeletons -->
    <div v-if="status === 'pending'" class="space-y-3">
      <AppSkeleton :height="80" :count="3" />
    </div>

    <!-- Empty state -->
    <div v-else-if="!routines?.length" class="rounded-tile bg-surface px-4 py-10 text-center">
      <UIcon name="i-lucide-clipboard-list" class="mx-auto size-8 text-label-tertiary" />
      <p class="mt-3 text-sm text-label-secondary">No PT routines yet.</p>
      <p class="mt-1 text-xs text-label-secondary">Create a routine to keep your PT exercises alongside your workouts.</p>
      <UButton color="primary" size="sm" class="mt-4" @click="openCreate">
        Create your first routine
      </UButton>
    </div>

    <!-- Routine list -->
    <div v-else class="space-y-3">
      <div
        v-for="routine in routines"
        :key="routine.id"
        class="flex items-center gap-3 rounded-tile bg-surface px-4 py-3.5"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-label">{{ routine.name }}</p>
          <p class="mt-0.5 text-xs text-label-secondary">
            {{ routine.exercises.length }} {{ routine.exercises.length === 1 ? 'exercise' : 'exercises' }}
          </p>
        </div>
        <UButton
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Edit routine"
          @click="openEdit(routine)"
        />
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="sm"
          aria-label="Delete routine"
          :loading="isDeleting(routine.id)"
          @click="requestDelete(routine)"
        />
      </div>
    </div>

    <!-- Create / edit drawer -->
    <PtRoutineEditorDrawer
      v-model:open="editorOpen"
      :routine="editingRoutine"
      :saving="saving"
      @save="handleSave"
    />

    <!-- Delete confirmation -->
    <UModal v-model:open="deleteDialogOpen" title="Delete Routine" :description="`Delete “${deleteTarget?.name}” and its exercises? This cannot be undone.`">
      <template #body>
        <div class="flex justify-end gap-3">
          <UButton color="neutral" variant="ghost" @click="cancelDelete">
            Cancel
          </UButton>
          <UButton color="error" @click="confirmDelete">
            Delete
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
