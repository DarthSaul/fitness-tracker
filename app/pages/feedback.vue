<script setup lang="ts">
definePageMeta({ layout: 'app' })

type FeedbackItem = {
  id: string
  content: string
  screenshotUrl: string | null
  addressed: boolean
  createdAt: string
  user: { name: string | null }
}

type FilterOption = 'all' | 'unaddressed' | 'addressed'

const content = ref('')
const screenshot = ref<File | null>(null)
const screenshotPreview = ref<string | null>(null)
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

function firstName(name: string | null): string {
  if (!name?.trim()) return 'You'
  return name.trim().split(' ')[0] ?? 'You'
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0] ?? null
  screenshot.value = file
  if (screenshotPreview.value) {
    URL.revokeObjectURL(screenshotPreview.value)
    screenshotPreview.value = null
  }
  if (file) {
    screenshotPreview.value = URL.createObjectURL(file)
  }
}

function clearScreenshot() {
  screenshot.value = null
  if (screenshotPreview.value) {
    URL.revokeObjectURL(screenshotPreview.value)
    screenshotPreview.value = null
  }
}

async function submit() {
  if (!content.value.trim() || submitting.value) return
  submitting.value = true
  success.value = false
  error.value = ''

  try {
    const fd = new FormData()
    fd.append('content', content.value.trim())
    if (screenshot.value) fd.append('screenshot', screenshot.value)

    await $fetch('/api/feedback', { method: 'POST', body: fd })

    content.value = ''
    clearScreenshot()
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

      <!-- Screenshot picker -->
      <div class="space-y-2">
        <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
          <input type="file" accept="image/*" class="sr-only" @change="onFileChange" />
          <span>📎</span>
          <span v-if="screenshot" class="max-w-[240px] truncate text-violet-400">{{ screenshot.name }}</span>
          <span v-else>Attach screenshot</span>
        </label>

        <!-- Thumbnail preview -->
        <div v-if="screenshotPreview" class="relative inline-block">
          <img :src="screenshotPreview" class="max-h-32 w-auto rounded-lg" alt="Screenshot preview" />
          <button
            type="button"
            class="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-xs text-slate-300 hover:bg-slate-600"
            aria-label="Remove screenshot"
            @click="clearScreenshot"
          >
            ✕
          </button>
        </div>
      </div>

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

    <div v-else-if="filtered.length === 0" class="py-4 text-center text-sm text-slate-500">
      No feedback yet.
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="item in filtered"
        :key="item.id"
        class="flex items-start gap-3 rounded-xl bg-slate-800 px-4 py-3"
      >
        <div class="min-w-0 flex-1">
          <p class="text-xs font-medium text-violet-400">{{ firstName(item.user.name) }}</p>
          <p class="mt-0.5 text-sm text-white whitespace-pre-wrap">{{ item.content }}</p>
          <a
            v-if="item.screenshotUrl"
            :href="item.screenshotUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="mt-2 block"
          >
            <img :src="item.screenshotUrl" class="max-h-48 w-auto rounded-lg" alt="Attached screenshot" />
          </a>
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
