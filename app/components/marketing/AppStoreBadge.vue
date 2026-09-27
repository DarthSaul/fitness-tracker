/**
 * Apple's official "Download on the App Store" badge, linking to the listing.
 *
 * The artwork is Apple's unmodified black en-US SVG from Apple Marketing
 * Tools; its guidelines forbid recolouring or restyling it, so it stays
 * black in both schemes. 48px sits above Apple's 40px minimum height.
 */
<script setup lang="ts">
import { APP_STORE_URL } from '../../utils/app-store'
</script>

<template>
  <a
    :href="APP_STORE_URL"
    target="_blank"
    rel="noopener"
    class="inline-block rounded-chip focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tint"
  >
    <img
      src="/img/app-store-badge.svg"
      alt="Download on the App Store"
      width="144"
      height="48"
      class="block h-12 w-auto"
    >
  </a>
</template>
