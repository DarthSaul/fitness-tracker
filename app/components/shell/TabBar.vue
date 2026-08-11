/**
 * The five-item bottom tab bar — the phone shell's primary navigation.
 *
 * Hidden at `lg`, where the side nav takes over. The layout owns that
 * breakpoint so the bar and its resume banner hide as one piece.
 */
<script setup lang="ts">
// Imported explicitly rather than auto-imported so the component test mounts
// against the real nav model instead of a stub. A relative path, not `~/`:
// that alias points at `app/` under Nuxt but at the repo root under vitest.
import { APP_NAV_ITEMS, isNavItemActive } from '../../composables/useAppNav'

const route = useRoute()
</script>

<template>
  <nav
    class="border-t border-separator bg-material backdrop-blur-2xl backdrop-saturate-150"
    style="padding-bottom: env(safe-area-inset-bottom)"
  >
    <div class="mx-auto flex max-w-lg items-stretch justify-around px-2 py-1.5">
      <NuxtLink
        v-for="item in APP_NAV_ITEMS"
        :key="item.label"
        :to="item.to"
        class="flex flex-1 flex-col items-center gap-0.5 py-1 transition-colors"
        :class="isNavItemActive(item.to, route.path) ? 'text-tint' : 'text-label-secondary'"
        :aria-current="isNavItemActive(item.to, route.path) ? 'page' : undefined"
      >
        <UIcon :name="item.icon" class="size-6" />
        <span class="text-caption2">{{ item.label }}</span>
      </NuxtLink>
    </div>
  </nav>
</template>
