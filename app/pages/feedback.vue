<script setup lang="ts">
definePageMeta({ layout: 'app' })

type FeedbackItem = {
  id: string
  content: string
  addressed: boolean
  createdAt: string
}

type FilterOption = 'all' | 'unaddressed' | 'addressed'

const content = ref('')
const submitting = ref(false)
const success = ref(false)
const error = ref('')
const filter = ref<FilterOption>('all')

const { data: feedbackList, status, refresh } = await useFetch<FeedbackItem[]>('/api/feedback')

const filtered = computed(() => {
  if (!feedbackList.value) return []
  if (filter.value === 'addressed') return feedbackList.value.filter(f => f.addressed)
  if (filter.value === 'unaddressed') return feedbackList.value.filter(f => !f.addressed)
  return feedbackList.value
})

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
    await refresh()
  } catch {
    error.value = 'Something went wrong. Please try again.'
  } finally {
    submitting.value = false
  }
}

async function toggleAddressed(item: FeedbackItem) {
  try {
    await $fetch(`/api/feedback/${item.id}`, {
      method: 'PATCH',
      body: { addressed: !item.addressed },
    })
    await refresh()
  } catch {
    // silent — optimistic UX not needed for a personal tool
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="space-y-6 pt-2">
    <div>
      <h2 class="text-xl font-semibold text-white">Feedback</h2>
      <p class="mt-1 text-sm text-slate-400">Jot down thoughts while you're using the app.</p>
    </div>

    <!-- Submit form -->
    <div class="space-y-3">
      <textarea
        v-model="content"
        rows="4"
        placeholder="What's on your mind?"
        class="w-full resize-none rounded-xl bg-slate-800 px-4 py-3 text-base text-white placeholder-slate-500 outline-none ring-1 ring-slate-700 focus:ring-violet-500 transition-colors"
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

    <hr class="border-slate-700" />

    <!-- Filter tabs -->
    <div class="flex gap-2">
      <button
        v-for="opt in (['all', 'unaddressed', 'addressed'] as FilterOption[])"
        :key="opt"
        type="button"
        class="rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors"
        :class="filter === opt ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400'"
        @click="filter = opt"
      >
        {{ opt }}
      </button>
    </div>

    <!-- Feedback list -->
    <div v-if="status === 'pending'" class="space-y-3">
      <div v-for="i in 3" :key="i" class="h-16 animate-pulse rounded-xl bg-slate-800" />
    </div>

    <div v-else-if="filtered.length === 0" class="text-center text-sm text-slate-500 py-4">
      No feedback yet.
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="item in filtered"
        :key="item.id"
        class="flex items-start gap-3 rounded-xl bg-slate-800 px-4 py-3"
      >
        <div class="flex-1 min-w-0">
          <p class="text-sm text-white whitespace-pre-wrap">{{ item.content }}</p>
          <p class="mt-1 text-xs text-slate-500">{{ formatDate(item.createdAt) }}</p>
        </div>
        <button
          type="button"
          class="mt-0.5 shrink-0 text-lg leading-none transition-opacity"
          :class="item.addressed ? 'opacity-100' : 'opacity-25 hover:opacity-60'"
          :aria-label="item.addressed ? 'Mark unaddressed' : 'Mark addressed'"
          @click="toggleAddressed(item)"
        >
          ✅
        </button>
      </div>
    </div>
  </div>
</template>
