<script setup lang="ts">
definePageMeta({ layout: 'app' })

import type { ProgramSummary } from '~/types/program'

const { data: programs, status } = useFetch<ProgramSummary[]>('/api/programs')
const { isSaved, isSaving, toggleSave, isActive, isActivating, toggleActive } = useUserPrograms()

const filter = ref<'all' | 'saved'>('all')

const filteredPrograms = computed(() => {
  if (!programs.value) return []
  if (filter.value === 'saved') return programs.value.filter(p => isSaved(p.id))
  return programs.value
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold text-white">
        Programs
      </h2>
      <p class="mt-1 text-sm text-slate-400">
        Browse available workout programs
      </p>
    </div>

    <!-- Loading state -->
    <div v-if="status === 'pending'" class="space-y-4">
      <div
        v-for="i in 3"
        :key="i"
        class="h-28 animate-pulse rounded-lg bg-slate-800"
      />
    </div>

    <!-- Error state -->
    <UCard v-else-if="status === 'error'">
      <div class="text-center text-red-400">
        <p>Failed to load programs.</p>
        <p class="mt-1 text-sm">
          Please try again later.
        </p>
      </div>
    </UCard>

    <!-- Empty state -->
    <UCard v-else-if="programs && programs.length === 0">
      <div class="text-center text-slate-400">
        <p>No programs available.</p>
        <p class="mt-1 text-sm">
          Check back later for new programs.
        </p>
      </div>
    </UCard>

    <!-- Filter toggle -->
    <div v-if="programs && programs.length > 0" class="flex gap-1">
      <UButton
        size="xs"
        :color="filter === 'all' ? 'primary' : 'neutral'"
        :variant="filter === 'all' ? 'solid' : 'ghost'"
        @click="filter = 'all'"
      >
        All
      </UButton>
      <UButton
        size="xs"
        :color="filter === 'saved' ? 'primary' : 'neutral'"
        :variant="filter === 'saved' ? 'solid' : 'ghost'"
        @click="filter = 'saved'"
      >
        Saved
      </UButton>
    </div>

    <!-- Program list -->
    <div v-if="status !== 'pending' && status !== 'error' && programs && programs.length > 0" class="space-y-4">
      <template v-if="filteredPrograms.length > 0">
        <UCard
          v-for="program in filteredPrograms"
          :key="program.id"
          v-wave
          class="overflow-hidden cursor-pointer"
          @click="navigateTo(`/programs/${program.id}`)"
        >
          <div class="flex items-start justify-between">
            <div class="min-w-0 flex-1">
              <h3 class="font-semibold text-white">
                {{ program.name }}
              </h3>
            </div>
            <div class="ml-3 flex shrink-0 items-center gap-2">
              <span class="rounded-full bg-violet-600/20 px-2.5 py-0.5 text-xs font-medium text-violet-400">
                {{ program._count.weeks }} {{ program._count.weeks === 1 ? 'week' : 'weeks' }}
              </span>
              <UButton
                :icon="isSaved(program.id) ? 'i-lucide-bookmark-check' : 'i-lucide-bookmark'"
                :color="isSaved(program.id) ? 'primary' : 'neutral'"
                :variant="isSaved(program.id) ? 'soft' : 'ghost'"
                size="sm"
                :loading="isSaving(program.id)"
                @click.stop="toggleSave(program.id)"
              />
              <UButton
                v-if="isSaved(program.id)"
                :icon="isActive(program.id) ? 'i-lucide-circle-check' : 'i-lucide-play'"
                :color="isActive(program.id) ? 'success' : 'neutral'"
                :variant="isActive(program.id) ? 'soft' : 'outline'"
                size="sm"
                :loading="isActivating(program.id)"
                @click.stop="toggleActive(program.id)"
              >
                {{ isActive(program.id) ? 'Active' : 'Start' }}
              </UButton>
            </div>
          </div>
          <p
            v-if="program.description"
            class="mt-2 text-sm text-slate-400"
          >
            {{ program.description }}
          </p>
        </UCard>
      </template>
      <p v-else class="text-center text-sm text-slate-500">
        No programs saved yet.
      </p>
    </div>
  </div>
</template>
