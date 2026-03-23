<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

function reload(): void {
  window.location.reload()
}
</script>

<template>
  <div class="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
    <p class="mb-4 text-4xl">📡</p>
    <h1 class="mb-2 text-xl font-semibold text-white">You're offline</h1>
    <p class="mb-6 text-sm text-slate-400">
      Check your connection and try again.
    </p>
    <button
      class="rounded-lg bg-violet-600 px-6 py-2.5 text-sm font-medium text-white"
      @click="reload"
    >
      Retry
    </button>
  </div>
</template>
