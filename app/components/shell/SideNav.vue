/**
 * The desktop side rail — primary navigation from `lg` up, where the bottom
 * tab bar is hidden.
 *
 * A flex sibling of the content column rather than a fixed overlay, so it
 * needs no z-index and cannot cover anything. Sign-out is deliberately absent:
 * it lives in Settings, which the identity row at the foot links to. Putting a
 * destructive action in permanent chrome is a regression risk with no upside.
 */
<script setup lang="ts">
import { APP_NAV_ITEMS, isNavItemActive } from '../../composables/useAppNav'

defineProps<{
  /** The open session, if any. Null hides the resume card. */
  resumeTarget?: { to: string, subtitle: string } | null
}>()

const route = useRoute()
const config = useRuntimeConfig()
const { user } = useAuth()

const userInitial = computed(() => user.value?.name?.charAt(0).toUpperCase() ?? '?')
</script>

<template>
  <div class="w-sidenav shrink-0 flex-col border-r border-separator bg-canvas px-3 py-4">
    <NuxtLink
      to="/"
      class="flex items-center gap-2.5 rounded-panel px-2 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tint"
    >
      <img src="/icons/icon-192.png" alt="" aria-hidden="true" class="size-8 rounded-tile">
      <span class="text-headline font-bold tracking-tight">DR. DUMBBELL</span>
    </NuxtLink>

    <nav aria-label="Primary" class="mt-6">
      <ul class="space-y-1">
        <li v-for="item in APP_NAV_ITEMS" :key="item.label">
          <NuxtLink
            :to="item.to"
            class="flex items-center gap-3 rounded-panel px-3 py-2.5 text-body transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tint"
            :class="isNavItemActive(item.to, route.path)
              ? 'bg-tint/15 font-semibold text-tint'
              : 'text-label-secondary hover:bg-fill hover:text-label'"
            :aria-current="isNavItemActive(item.to, route.path) ? 'page' : undefined"
          >
            <UIcon :name="item.icon" class="size-5 shrink-0" />
            {{ item.label }}
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <div class="flex-1" />

    <ShellResumeBanner
      v-if="resumeTarget"
      :to="resumeTarget.to"
      :subtitle="resumeTarget.subtitle"
      variant="inline"
      class="mb-3"
    />

    <NuxtLink
      to="/settings"
      class="flex items-center gap-2.5 rounded-panel px-2 py-2 transition-colors hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tint"
      aria-label="Account settings"
    >
      <span
        class="flex size-9 shrink-0 items-center justify-center rounded-full bg-ios-purple/15 text-subheadline font-semibold text-ios-purple"
      >
        {{ userInitial }}
      </span>
      <span class="min-w-0">
        <span class="block truncate text-subheadline font-semibold">{{ user?.name ?? 'Unknown' }}</span>
        <span class="block truncate text-caption text-label-secondary">{{ user?.email ?? '' }}</span>
      </span>
    </NuxtLink>

    <p class="mt-2 px-2 text-caption2 tnum text-label-tertiary">v{{ config.public.appVersion }}</p>
  </div>
</template>
