/**
 * Development-only gallery of the iOS design-system primitives.
 *
 * Exists so the whole token layer can be eyeballed on one screen in both
 * colour schemes — checking light mode across a dozen real screens is
 * otherwise a slow, easy-to-skip manual pass.
 */
<script setup lang="ts">
definePageMeta({
  layout: 'app',
  header: { title: 'Style Guide', emoji: '🎨' },
})

// Not a production surface: 404 outside dev rather than shipping a public page.
if (!import.meta.dev) {
  throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}

const colorMode = useColorMode()

const surfaces = [
  { name: 'canvas', class: 'bg-canvas' },
  { name: 'canvas-grouped', class: 'bg-canvas-grouped' },
  { name: 'surface', class: 'bg-surface' },
  { name: 'surface-elevated', class: 'bg-surface-elevated' },
  { name: 'fill', class: 'bg-fill' },
]

const accents = [
  { name: 'tint', class: 'bg-tint' },
  { name: 'ios-green', class: 'bg-ios-green' },
  { name: 'ios-orange', class: 'bg-ios-orange' },
  { name: 'ios-red', class: 'bg-ios-red' },
  { name: 'ios-purple', class: 'bg-ios-purple' },
  { name: 'ios-pink', class: 'bg-ios-pink' },
  { name: 'ios-mint', class: 'bg-ios-mint' },
  { name: 'ios-gray', class: 'bg-ios-gray' },
]

const typeScale = [
  { name: 'large-title', class: 'text-large-title' },
  { name: 'title', class: 'text-title' },
  { name: 'title2', class: 'text-title2' },
  { name: 'title3', class: 'text-title3' },
  { name: 'headline', class: 'text-headline' },
  { name: 'body', class: 'text-body' },
  { name: 'subheadline', class: 'text-subheadline' },
  { name: 'footnote', class: 'text-footnote' },
  { name: 'caption', class: 'text-caption' },
  { name: 'caption2', class: 'text-caption2' },
]

/** Every icon the shell and the new screens rely on — a missing name renders
 *  as an empty box, which is easy to miss on a real screen. */
const icons = [
  'i-lucide-house', 'i-lucide-history', 'i-lucide-trending-up', 'i-lucide-dumbbell',
  'i-lucide-settings', 'i-lucide-contrast', 'i-lucide-message-square',
  'i-lucide-activity', 'i-lucide-list-checks', 'i-lucide-chevron-right',
  'i-lucide-chevron-left', 'i-lucide-triangle-alert', 'i-lucide-circle-dashed',
  'i-lucide-check', 'i-lucide-x', 'i-lucide-loader-circle', 'i-lucide-eye',
  'i-lucide-clock', 'i-lucide-repeat', 'i-lucide-calendar-check', 'i-lucide-weight',
]

const sheetOpen = ref(false)
</script>

<template>
  <div class="space-y-8">
    <section class="space-y-2">
      <p class="text-caption font-semibold uppercase text-label-secondary">Scheme</p>
      <div class="flex gap-2">
        <UButton
          v-for="value in ['light', 'dark', 'system']"
          :key="value"
          size="sm"
          :variant="colorMode.preference === value ? 'solid' : 'soft'"
          :label="value"
          @click="colorMode.preference = value"
        />
      </div>
      <p class="text-caption text-label-secondary">Resolved: {{ colorMode.value }}</p>
    </section>

    <section class="space-y-2">
      <p class="text-caption font-semibold uppercase text-label-secondary">Surfaces</p>
      <div class="flex flex-wrap gap-2">
        <div v-for="s in surfaces" :key="s.name" class="w-[calc(50%-0.25rem)]">
          <div class="h-12 rounded-tile border border-separator" :class="s.class" />
          <p class="mt-1 text-caption2 text-label-secondary">{{ s.name }}</p>
        </div>
      </div>
    </section>

    <section class="space-y-2">
      <p class="text-caption font-semibold uppercase text-label-secondary">Accents</p>
      <div class="grid grid-cols-4 gap-2">
        <div v-for="a in accents" :key="a.name">
          <div class="h-10 rounded-tile" :class="a.class" />
          <p class="mt-1 text-caption2 text-label-secondary">{{ a.name }}</p>
        </div>
      </div>
    </section>

    <section class="space-y-2">
      <p class="text-caption font-semibold uppercase text-label-secondary">Type scale</p>
      <div class="space-y-1 rounded-card bg-surface p-4">
        <p v-for="t in typeScale" :key="t.name" :class="t.class">
          {{ t.name }} — 1234567890
        </p>
        <p class="text-label-secondary">label-secondary</p>
        <p class="text-label-tertiary">label-tertiary</p>
      </div>
    </section>

    <section class="space-y-2">
      <p class="text-caption font-semibold uppercase text-label-secondary">Cards</p>
      <AppCard rail="brand" :min-height="120">
        <p class="text-caption text-label-secondary">Next up</p>
        <p class="text-headline">Week 2 · Day 3</p>
        <div class="mt-3 space-y-2">
          <AppActionPill label="Start next workout" tint="green" />
          <AppActionPill label="Preview workout" tint="secondary" icon="i-lucide-eye" />
        </div>
      </AppCard>
      <AppCard rail="completed">
        <p class="text-caption text-label-secondary">Completed</p>
        <p class="text-headline">Week 2 · Day 2</p>
      </AppCard>
      <AppCard rail="muted">
        <p class="text-headline">No workout</p>
      </AppCard>
      <AppCard>
        <p class="text-headline">Plain surface card</p>
      </AppCard>
    </section>

    <section class="space-y-2">
      <p class="text-caption font-semibold uppercase text-label-secondary">Chips &amp; badges</p>
      <div class="flex flex-wrap items-center gap-2">
        <AppChip icon="i-lucide-clock" label="Rest 90s" />
        <AppChip as="button" icon="i-lucide-trending-up" label="Trend" />
        <AppChip as="button" icon="i-lucide-repeat" label="Swap" />
        <AppStatusBadge label="Active" color="green" />
        <AppStatusBadge label="Swapped" color="orange" />
        <AppStatusBadge label="Beta" color="orange" />
        <AppStatusBadge label="Upcoming" color="gray" />
      </div>
    </section>

    <section class="space-y-2">
      <p class="text-caption font-semibold uppercase text-label-secondary">Stats &amp; progress</p>
      <AppStatTileGroup>
        <AppStatTile icon="i-lucide-calendar-check" value="42" label="Sessions" />
        <AppStatTile icon="i-lucide-calendar" value="3" label="this week" />
        <AppStatTile icon="i-lucide-weight" value="12.4k" label="lbs total" />
      </AppStatTileGroup>
      <div class="flex items-center gap-4 rounded-card bg-surface p-4">
        <AppProgressRing :value="3" :total="24" />
        <AppProgressRing :value="18" :total="24" :size="48" />
      </div>
    </section>

    <section class="space-y-2">
      <p class="text-caption font-semibold uppercase text-label-secondary">Set grid</p>
      <div class="rounded-card bg-surface p-4">
        <div class="grid grid-cols-5 items-center pb-2 text-caption2 font-semibold uppercase text-label-secondary">
          <span class="text-center">#</span>
          <span class="text-center">lb</span>
          <span class="text-center">Reps</span>
          <span class="text-center">Effort</span>
          <span class="text-center">Done</span>
        </div>
        <div class="grid grid-cols-5 items-center py-2 text-subheadline tnum">
          <span class="text-center text-caption font-medium text-ios-green">1</span>
          <span class="text-center text-ios-green">135</span>
          <span class="text-center text-ios-green">10</span>
          <span class="text-center text-caption text-label-tertiary">RPE 8</span>
          <span class="flex justify-center"><UIcon name="i-lucide-check" class="size-4 text-ios-green" /></span>
        </div>
        <div class="grid grid-cols-5 items-center py-2 text-subheadline tnum">
          <span class="text-center text-caption font-medium text-label-secondary">2</span>
          <span class="text-center text-label">135</span>
          <span class="text-center text-label">10</span>
          <span class="text-center text-caption text-label-tertiary">RPE 8</span>
          <span class="flex justify-center"><UIcon name="i-lucide-circle-dashed" class="size-4 text-label-tertiary" /></span>
        </div>
        <div class="grid grid-cols-5 items-center py-2 text-subheadline tnum">
          <span class="text-center text-caption font-medium text-ios-orange">3</span>
          <span class="text-center font-semibold text-ios-green">145</span>
          <span class="text-center font-semibold text-ios-green">8</span>
          <span class="text-center text-caption text-label-tertiary">—</span>
          <span class="flex justify-center"><UIcon name="i-lucide-check" class="size-4 text-ios-green" /></span>
        </div>
      </div>
    </section>

    <section class="space-y-2">
      <p class="text-caption font-semibold uppercase text-label-secondary">Nuxt UI inheritance</p>
      <div class="flex flex-wrap gap-2">
        <UButton label="Primary" />
        <UButton label="Soft" variant="soft" />
        <UButton label="Outline" variant="outline" />
        <UButton label="Error" color="error" variant="soft" />
        <UButton label="Sheet" variant="subtle" @click="sheetOpen = true" />
      </div>
      <UInput placeholder="Input" class="w-full" size="xl" />
      <UAlert color="error" variant="subtle" title="Something went wrong" icon="i-lucide-alert-circle" />
    </section>

    <section class="space-y-2">
      <p class="text-caption font-semibold uppercase text-label-secondary">Icons</p>
      <div class="flex flex-wrap gap-3 rounded-card bg-surface p-4">
        <UIcon v-for="icon in icons" :key="icon" :name="icon" class="size-6 text-label" />
      </div>
    </section>

    <section class="space-y-2">
      <p class="text-caption font-semibold uppercase text-label-secondary">Skeletons</p>
      <AppSkeleton :height="96" />
      <AppSkeleton :height="56" :count="3" />
    </section>

    <AppSheet v-model:open="sheetOpen" title="Log set" description="Example bottom sheet">
      <p class="text-subheadline text-label-secondary">Target: 135 lbs × 8 reps at RPE 8</p>
      <template #footer>
        <UButton block size="lg" label="Log Set" @click="sheetOpen = false" />
      </template>
    </AppSheet>
  </div>
</template>
