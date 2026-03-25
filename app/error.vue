<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const isUnauthorized = computed(
  () => props.error.statusCode === 401,
)

function handleError() {
  clearError({ redirect: isUnauthorized.value ? '/login' : '/' })
}
</script>

<template>
  <div class="flex min-h-dvh flex-col items-center justify-center bg-neutral-950 px-4">
    <h1 class="text-6xl font-bold text-white">
      {{ error.statusCode }}
    </h1>
    <p class="mt-4 text-neutral-400">
      {{ error.statusMessage || 'Something went wrong' }}
    </p>
    <UButton
      class="mt-6"
      :label="isUnauthorized ? 'Go to Login' : 'Go Home'"
      @click="handleError"
    />
  </div>
</template>
