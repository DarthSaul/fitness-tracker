/**
 * Home dashboard page shown after login — currently a placeholder for the active workout session UI.
 */
<script setup lang="ts">
definePageMeta({ layout: 'app' })

const { user } = useAuth()
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold text-white">
        Welcome, {{ user?.name ?? 'there' }}
      </h2>
    </div>

    <UCard>
      <div class="text-center text-slate-400">
        <p>No active programs yet.</p>
        <p class="mt-1 text-sm">
          Browse programs to get started.
        </p>
      </div>
    </UCard>
  </div>
</template>
