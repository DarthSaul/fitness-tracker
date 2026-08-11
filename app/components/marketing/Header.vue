/**
 * Sticky marketing header: wordmark, section anchors and the two auth CTAs.
 *
 * The anchors simply drop out below `md` rather than collapsing into a
 * hamburger — three links do not justify a menu, and the sign-in path stays
 * one tap away at every width.
 */
<script setup lang="ts">
const links = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Progress', href: '#progress' },
]
</script>

<template>
  <header class="sticky top-0 z-20 border-b border-separator bg-canvas/80 backdrop-blur-xl">
    <div class="mx-auto flex h-14 w-full max-w-frame items-center gap-6 px-6 lg:px-10">
      <NuxtLink
        to="/"
        class="flex items-center gap-2.5 rounded-panel focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tint"
      >
        <img src="/icons/icon-192.png" alt="" aria-hidden="true" class="size-7 rounded-chip">
        <span class="text-headline font-bold tracking-tight">DR. DUMBBELL</span>
      </NuxtLink>

      <nav aria-label="Sections" class="hidden flex-1 items-center gap-6 md:flex">
        <a
          v-for="link in links"
          :key="link.href"
          :href="link.href"
          class="text-subheadline text-label-secondary transition-colors hover:text-label focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tint"
        >
          {{ link.label }}
        </a>
      </nav>

      <div class="ml-auto flex items-center gap-3 md:ml-0">
        <NuxtLink
          to="/login"
          class="text-subheadline font-medium text-label-secondary transition-colors hover:text-label focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tint"
        >
          Sign in
        </NuxtLink>
        <UButton to="/login?signup=1" size="sm" color="primary" label="Get started" />
      </div>
    </div>
  </header>
</template>
