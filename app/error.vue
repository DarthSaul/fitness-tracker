<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const isUnauthorized = computed(
  () => props.error.statusCode === 401,
)
</script>

<template>
  <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif;">
    <h1>{{ error.statusCode }}</h1>
    <p>{{ error.statusMessage || 'Something went wrong' }}</p>
    <a v-if="isUnauthorized" href="/api/auth/google">
      <button type="button">Log in with Google</button>
    </a>
  </div>
</template>
