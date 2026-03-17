<script setup lang="ts">
definePageMeta({ layout: 'app' })

import type { ProgramSummary } from '~/types/program'

const { data: programs, status } = useFetch<ProgramSummary[]>('/api/programs')
const { isSaved, isSaving, toggleSave } = useUserPrograms()
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

    <!-- Program list -->
    <div v-else class="space-y-4">
      <NuxtLink
        v-for="program in programs"
        :key="program.id"
        :to="`/programs/${program.id}`"
        class="block"
      >
        <UCard>
          <div class="flex items-start justify-between">
            <div class="min-w-0 flex-1">
              <h3 class="font-semibold text-white">
                {{ program.name }}
              </h3>
              <p
                v-if="program.description"
                class="mt-1 line-clamp-2 text-sm text-slate-400"
              >
                {{ program.description }}
              </p>
            </div>
            <div class="ml-3 flex shrink-0 items-center gap-2">
              <span class="rounded-full bg-violet-600/20 px-2.5 py-0.5 text-xs font-medium text-violet-400">
                {{ program._count.weeks }} {{ program._count.weeks === 1 ? 'week' : 'weeks' }}
              </span>
              <UButton
                :icon="isSaved(program.id) ? 'i-lucide-bookmark-check' : 'i-lucide-bookmark'"
                :color="isSaved(program.id) ? 'primary' : 'neutral'"
                variant="ghost"
                size="sm"
                :loading="isSaving(program.id)"
                @click.prevent="toggleSave(program.id)"
              />
            </div>
          </div>
        </UCard>
      </NuxtLink>
    </div>
  </div>
</template>
