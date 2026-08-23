<script setup lang="ts">
definePageMeta({ layout: 'app', header: { title: 'Programs', emoji: '🏋️' } })

import type { ProgramSummary } from '~/types/program'

const { data: programs, status } = useFetch<ProgramSummary[]>('/api/programs', {
  key: CACHE_KEYS.PROGRAMS,
  getCachedData: (key) => getCached(key),
})
const { isSaved, isSaving, toggleSave, isActive, isActivating, toggleActive } = useUserPrograms()

const filter = ref<'all' | 'active' | 'saved'>('all')

const filteredPrograms = computed(() => {
  if (!programs.value) return []
  if (filter.value === 'active') return programs.value.filter(p => isActive(p.id))
  if (filter.value === 'saved') return programs.value.filter(p => isSaved(p.id))
  return programs.value
})

const emptyMessage = computed(() => {
  if (filter.value === 'active') return 'No active programs.'
  return 'No programs saved yet.'
})
</script>

<template>
  <div class="space-y-6">
    <!-- Loading state -->
    <div v-if="status === 'pending'" class="space-y-4">
      <AppSkeleton :height="112" :count="3" />
    </div>

    <!-- Error state -->
    <UCard v-else-if="status === 'error'">
      <div class="text-center text-ios-red">
        <p>Failed to load programs.</p>
        <p class="mt-1 text-sm">
          Please try again later.
        </p>
      </div>
    </UCard>

    <!-- Empty state -->
    <UCard v-else-if="programs && programs.length === 0">
      <div class="text-center text-label-secondary">
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
        :color="filter === 'active' ? 'primary' : 'neutral'"
        :variant="filter === 'active' ? 'solid' : 'ghost'"
        @click="filter = 'active'"
      >
        Active
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

    <!-- Program list. Two-up from `xl`; a real element rather than a fragment so
         the empty-state message below does not become a half-width grid cell. -->
    <div v-if="status !== 'pending' && status !== 'error' && programs && programs.length > 0">
      <!-- auto-rows-fr sizes every row track equally and the default stretch
           alignment fills each card to its cell, so all cards match heights. -->
      <div
        v-if="filteredPrograms.length > 0"
        class="space-y-4 xl:grid xl:grid-cols-2 xl:auto-rows-fr xl:gap-4 xl:space-y-0"
      >
        <UCard
          v-for="program in filteredPrograms"
          :key="program.id"
          v-wave
          class="overflow-hidden cursor-pointer"
          @click="navigateTo(`/programs/${program.id}`)"
        >
          <div class="flex items-start justify-between">
            <div class="min-w-0 flex-1">
              <h3 class="font-semibold text-label">
                {{ program.name }}
              </h3>
            </div>
            <div class="ml-3 flex shrink-0 items-center gap-2">
              <span class="rounded-full bg-tint/15 px-2.5 py-0.5 text-xs font-medium text-tint">
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
            class="mt-2 text-sm text-label-secondary"
          >
            {{ program.description }}
          </p>
        </UCard>
      </div>
      <p v-else class="text-center text-sm text-label-secondary">
        {{ emptyMessage }}
      </p>
    </div>
  </div>
</template>
