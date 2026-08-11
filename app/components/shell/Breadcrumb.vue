/**
 * Breadcrumb trail for pushed screens on the desktop shell, standing in for
 * the phone's `< Back` bar.
 *
 * Hand-rolled rather than Nuxt UI's UBreadcrumb, which has no app.config block
 * and would arrive with default typography, separator and link colours that
 * fight the iOS token layer.
 */
<script setup lang="ts">
import type { Crumb } from '../../composables/useBreadcrumbs'

defineProps<{ items: Crumb[] }>()
</script>

<template>
  <nav aria-label="Breadcrumb" class="min-w-0">
    <ol class="flex min-w-0 items-center gap-1.5 text-subheadline">
      <li v-for="(crumb, i) in items" :key="crumb.label" class="flex min-w-0 items-center gap-1.5">
        <NuxtLink
          v-if="crumb.to"
          :to="crumb.to"
          class="shrink-0 text-tint transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tint"
        >
          {{ crumb.label }}
        </NuxtLink>
        <span v-else class="truncate font-semibold text-label" aria-current="page">
          {{ crumb.label }}
        </span>
        <UIcon
          v-if="i < items.length - 1"
          name="i-lucide-chevron-right"
          class="size-3.5 shrink-0 text-label-tertiary"
          aria-hidden="true"
        />
      </li>
    </ol>
  </nav>
</template>
