/**
 * Public marketing landing page — the product's front door.
 *
 * The only server-rendered route in the app. Two rules follow from that and
 * both are load-bearing:
 *
 *  1. No data fetching. During prerender a `useFetch` would run the Nitro
 *     handler in-process and open a database connection at build time.
 *  2. Nothing user-specific, and no branching on `useColorMode().value` in the
 *     template — the HTML is a public CDN artifact, and a scheme branch would
 *     hydrate-mismatch for every light-mode visitor. CSS `dark:` only.
 */
<script setup lang="ts">
definePageMeta({ layout: 'marketing' })

const { appUrl } = useRuntimeConfig().public
const { ready, loggedIn } = useAuth()

const title = 'Structured strength training you actually finish'
const description
  = 'A workout tracker for people following a real program. Multi-week programs, '
    + 'set-by-set logging, exercise swaps, a rest timer, and strength trends per exercise.'

// No dedicated OG artwork exists yet, so this points at the app icon, which
// carries the wordmark — a plain-but-correct preview beats a broken one. Swap
// to a 1200×630 card and `summary_large_image` when one is composed.
const ogImage = `${appUrl}/icons/icon-512.png`

useSeoMeta({
  title,
  description,
  ogType: 'website',
  ogUrl: `${appUrl}/`,
  ogTitle: `DR. DUMBBELL — ${title}`,
  ogDescription: description,
  ogImage,
  ogImageWidth: 512,
  ogImageHeight: 512,
  twitterCard: 'summary',
  twitterTitle: `DR. DUMBBELL — ${title}`,
  twitterDescription: description,
  twitterImage: ogImage,
})

useHead({ link: [{ rel: 'canonical', href: `${appUrl}/` }] })

/**
 * On a prerendered `/`, nuxt-auth-utils defers its session fetch to
 * `app:mounted` — which runs *after* the global middleware — so the guard
 * cannot see a signed-in visitor arriving cold. Redirect once the session
 * actually resolves.
 *
 * The cost is one `/api/_auth/session` round trip of marketing hero for a
 * signed-in user, which is the right trade for a page whose audience is
 * logged out.
 */
if (import.meta.client) {
  watch([ready, loggedIn], () => {
    if (ready.value && loggedIn.value) navigateTo('/home', { replace: true })
  }, { immediate: true })
}
</script>

<template>
  <div>
    <MarketingHero />
    <MarketingFeatureGrid />
    <MarketingHowItWorks />
    <MarketingProgress />
    <MarketingCta />
  </div>
</template>
