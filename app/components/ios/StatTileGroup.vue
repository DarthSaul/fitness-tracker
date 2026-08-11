/**
 * Three-across row of `AppStatTile`s, matching the iOS analytics header's
 * `HStack(spacing: 12)`.
 */
<template>
  <div class="grid grid-cols-3 gap-3">
    <slot />
  </div>
</template>
