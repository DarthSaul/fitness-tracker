/**
 * Immersive layout for the live workout: no tab bar and no resume banner, so
 * the session owns the whole screen. Mirrors the `fullScreenCover` the iOS
 * client presents `LiveWorkoutView` in.
 */
<template>
  <div class="fixed inset-0 flex flex-col overflow-hidden bg-canvas" style="height: 100dvh">
    <!--
      Safe-area padding is expressed as utilities rather than an inline style so
      the `lg:` overrides can win — inline styles beat classes unconditionally.
      The insets resolve to 0 on desktop, which would otherwise leave the
      session flush against the window edges.
    -->
    <main
      class="mx-auto w-full max-w-lg flex-1 overflow-y-auto px-4 pt-[calc(env(safe-area-inset-top)_+_0.75rem)] pb-[calc(env(safe-area-inset-bottom)_+_1.5rem)] lg:max-w-content lg:px-8 lg:pt-8 lg:pb-12"
    >
      <slot />
    </main>
  </div>
</template>
