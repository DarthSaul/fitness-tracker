/**
 * Immersive layout for the live workout: no tab bar and no resume banner, so
 * the session owns the whole screen. Mirrors the `fullScreenCover` the iOS
 * client presents `LiveWorkoutView` in.
 */
<template>
  <div class="fixed inset-0 flex flex-col overflow-hidden bg-canvas" style="height: 100dvh">
    <main
      class="mx-auto w-full max-w-lg flex-1 overflow-y-auto px-4"
      style="padding-top: calc(env(safe-area-inset-top) + 0.75rem); padding-bottom: calc(env(safe-area-inset-bottom) + 1.5rem)"
    >
      <slot />
    </main>
  </div>
</template>
