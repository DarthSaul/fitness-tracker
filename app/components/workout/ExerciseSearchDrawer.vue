<script setup lang="ts">

import type { ExerciseSummary } from '~/types/program'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  select: [exerciseName: string]
  close: []
}>()

const isOpen = computed({
  get: () => props.open,
  set: (v: boolean) => { if (!v) emit('close') },
})

const search = ref('')
const exercises = ref<ExerciseSummary[]>([])
const exercisesLoading = ref(false)
const exercisesError = ref(false)
const searchInputRef = ref<HTMLInputElement | null>(null)

watch(() => props.open, async (opened) => {
  if (opened) {
    search.value = ''
    exercisesLoading.value = true
    exercisesError.value = false
    await nextTick()
    searchInputRef.value?.focus()
    try {
      exercises.value = await $fetch<ExerciseSummary[]>('/api/exercises')
    } catch {
      exercises.value = []
      exercisesError.value = true
    } finally {
      exercisesLoading.value = false
    }
  }
})

const filteredExercises = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return exercises.value
  return exercises.value.filter(e => e.name.toLowerCase().includes(q))
})
</script>

<template>
  <UDrawer v-model:open="isOpen" direction="bottom" title="Add Exercise Group" description="Search and select an exercise to add as a new group">
    <template #content>
      <div class="mx-auto w-full max-w-lg px-5 pb-8 pt-4">
        <!-- Header -->
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-label">Add Exercise Group</h3>
          <button
            class="rounded-full p-1.5 text-label-secondary transition-colors hover:bg-label-secondary/10 hover:text-label"
            aria-label="Close"
            @click="emit('close')"
          >
            <UIcon name="i-lucide-x" class="size-5" />
          </button>
        </div>

        <!-- Search + list -->
        <input
          ref="searchInputRef"
          v-model="search"
          type="text"
          inputmode="search"
          placeholder="Search exercises..."
          class="mb-3 w-full rounded-tile bg-fill px-4 py-3 text-base text-label placeholder-label-tertiary outline-none ring-1 ring-separator focus:ring-tint"
        >

        <div v-if="exercisesLoading" class="space-y-2">
          <div v-for="n in 5" :key="n" class="h-10 animate-pulse rounded-tile bg-label-secondary/12" />
        </div>
        <div v-else-if="exercisesError" class="py-8 text-center text-sm text-ios-red">
          Failed to load exercises. Please close and try again.
        </div>
        <div v-else class="max-h-64 overflow-y-auto space-y-1">
          <button
            v-for="exercise in filteredExercises"
            :key="exercise.id"
            type="button"
            class="w-full rounded-tile px-3 py-2.5 text-left text-sm font-medium text-label transition-colors hover:bg-label-secondary/15 active:bg-label-secondary/20"
            @click="emit('select', exercise.name)"
          >
            {{ exercise.name }}
          </button>
          <p v-if="filteredExercises.length === 0" class="py-4 text-center text-sm text-label-secondary">
            No exercises found
          </p>
        </div>
      </div>
    </template>
  </UDrawer>
</template>
