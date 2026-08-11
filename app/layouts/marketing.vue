/**
 * Public marketing shell for the landing page.
 *
 * Separate from `default` — which is shared with /login, /offline and /auth/* —
 * so those screens do not sprout a marketing header and footer.
 *
 * This is the one page in the app where the *document* scrolls rather than a
 * fixed inner column: anchor links, mobile URL-bar collapse and crawler
 * behaviour all depend on it. It also deliberately omits PwaInstallBanner —
 * never prompt an install before sign-up.
 */
<template>
  <div class="min-h-dvh bg-canvas">
    <a
      href="#content"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-30 focus:rounded-chip focus:bg-surface focus:px-3 focus:py-2 focus:text-body"
    >
      Skip to content
    </a>

    <MarketingHeader />

    <!-- tabindex="-1" so the skip link can actually move focus here; without
         it the browser scrolls but focus stays on the link. -->
    <main id="content" tabindex="-1" class="outline-none">
      <slot />
    </main>

    <MarketingFooter />
  </div>
</template>
