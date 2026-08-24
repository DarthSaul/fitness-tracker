/**
 * History tab — every completed session, program and standalone interleaved,
 * newest first, paged as the user scrolls.
 */
<script setup lang="ts">
definePageMeta({
  layout: 'app',
  header: { title: 'History', emoji: '🕒', subtitle: 'Completed workouts' },
})

const { sessions, status, loadingMore, hasMore, pageError, load, loadMore } = useHistory()

const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

onMounted(async () => {
  await load()

  // Paging on an observer rather than a scroll handler keeps this working
  // inside the layout's scroll container, which is not the window.
  observer = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting)) void loadMore()
  }, { rootMargin: '200px' })

  if (sentinel.value) observer.observe(sentinel.value)
})

// The sentinel only exists once there are rows, so start observing when it
// appears rather than assuming it is present on mount.
watch(sentinel, (el) => {
  if (el && observer) observer.observe(el)
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div>
    <AppSkeleton v-if="status === 'pending'" :height="64" :count="6" />

    <!-- An empty account and a failed request must not look the same -->
    <div v-else-if="status === 'error'" class="flex flex-col items-center gap-3 py-16 text-center">
      <UIcon name="i-lucide-triangle-alert" class="size-8 text-label-tertiary" />
      <p class="text-headline">Couldn't load history</p>
      <p class="text-subheadline text-label-secondary">Something went wrong. Please try again.</p>
      <UButton variant="soft" label="Retry" class="mt-1" @click="load()" />
    </div>

    <div v-else-if="sessions.length === 0" class="flex flex-col items-center gap-3 py-16 text-center">
      <UIcon name="i-lucide-history" class="size-8 text-label-tertiary" />
      <p class="text-headline">No workouts yet</p>
      <p class="text-subheadline text-label-secondary">Finish a workout and it will show up here.</p>
    </div>

    <template v-else>
      <!-- One divided card at every width — a single newest-first column reads
           better than the old two-up grid, which zigzagged the timeline. -->
      <div class="divide-y divide-separator overflow-hidden rounded-card bg-surface">
        <HistoryRow
          v-for="entry in sessions"
          :key="entry.id"
          :entry="entry"
        />
      </div>

      <!-- Outside the grid: as a child it would take a cell of its own -->
      <div ref="sentinel" class="h-px" />

      <div v-if="loadingMore" class="py-4">
        <AppSkeleton :height="64" :count="2" />
      </div>
      <!-- A failed page is retryable; only a genuinely exhausted list is final -->
      <div v-else-if="pageError" class="flex flex-col items-center gap-2 py-6">
        <p class="text-caption text-label-secondary">Couldn't load more workouts.</p>
        <UButton size="xs" variant="soft" label="Try again" @click="loadMore()" />
      </div>
      <p v-else-if="!hasMore" class="py-6 text-center text-caption text-label-tertiary">
        That's everything.
      </p>
    </template>
  </div>
</template>
