<script setup lang="ts">
definePageMeta({ layout: 'app' })

import type { ProgramDetail } from '~/types/program'

const route = useRoute()
const programId = route.params.id as string

const { data: program, status } = useFetch<ProgramDetail>(`/api/programs/${programId}`)
const { isSaved, isSaving, toggleSave } = useUserPrograms()
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-3">
      <NuxtLink to="/programs">
        <UButton
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          size="sm"
        />
      </NuxtLink>
      <h2 class="text-lg font-semibold text-white">
        <template v-if="program">{{ program.name }}</template>
        <template v-else>Program</template>
      </h2>
    </div>

    <!-- Loading state -->
    <div v-if="status === 'pending'" class="space-y-4">
      <div class="h-20 animate-pulse rounded-lg bg-slate-800" />
      <div class="h-32 animate-pulse rounded-lg bg-slate-800" />
    </div>

    <!-- Error state -->
    <UCard v-else-if="status === 'error'">
      <div class="text-center text-red-400">
        <p>Failed to load program.</p>
        <p class="mt-1 text-sm">
          Please try again later.
        </p>
      </div>
    </UCard>

    <!-- Program detail -->
    <template v-else-if="program">
      <!-- Description + save -->
      <div class="flex items-start justify-between gap-3">
        <p v-if="program.description" class="text-sm text-slate-400">
          {{ program.description }}
        </p>
        <p v-else class="text-sm text-slate-500 italic">
          No description available.
        </p>
        <UButton
          :icon="isSaved(program.id) ? 'i-lucide-bookmark-check' : 'i-lucide-bookmark'"
          :color="isSaved(program.id) ? 'primary' : 'neutral'"
          :variant="isSaved(program.id) ? 'solid' : 'outline'"
          size="sm"
          :loading="isSaving(program.id)"
          class="shrink-0"
          @click="toggleSave(program.id)"
        >
          {{ isSaved(program.id) ? 'Saved' : 'Save' }}
        </UButton>
      </div>

      <!-- Weeks -->
      <div class="space-y-4">
        <h3 class="text-sm font-medium text-slate-300">
          Schedule
        </h3>
        <UCard v-for="week in program.weeks" :key="week.id">
          <div>
            <h4 class="font-semibold text-white">
              Week {{ week.weekNumber }}
            </h4>
            <p class="mt-1 text-sm text-slate-400">
              {{ week.days.length }} {{ week.days.length === 1 ? 'day' : 'days' }}
            </p>
          </div>
        </UCard>
      </div>
    </template>
  </div>
</template>
