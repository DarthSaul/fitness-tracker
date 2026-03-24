<script setup lang="ts">
definePageMeta({ layout: 'app' })

const content = ref('')
const submitting = ref(false)
const success = ref(false)
const error = ref('')

async function submit() {
  if (!content.value.trim() || submitting.value) return
  submitting.value = true
  success.value = false
  error.value = ''

  try {
    await $fetch('/api/feedback', {
      method: 'POST',
      body: { content: content.value.trim() },
    })
    content.value = ''
    success.value = true
  } catch {
    error.value = 'Something went wrong. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="space-y-6 pt-2">
    <div>
      <h2 class="text-xl font-semibold text-white">Feedback</h2>
      <p class="mt-1 text-sm text-slate-400">Jot down thoughts while you're using the app.</p>
    </div>

    <div class="space-y-3">
      <textarea
        v-model="content"
        rows="6"
        placeholder="What's on your mind?"
        class="w-full resize-none rounded-xl bg-slate-800 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none ring-1 ring-slate-700 focus:ring-violet-500 transition-colors"
      />

      <button
        type="button"
        :disabled="!content.trim() || submitting"
        class="w-full rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
        @click="submit"
      >
        {{ submitting ? 'Saving…' : 'Submit' }}
      </button>

      <p v-if="success" class="text-center text-sm text-green-400">Feedback saved</p>
      <p v-if="error" class="text-center text-sm text-red-400">{{ error }}</p>
    </div>
  </div>
</template>
