/**
 * Public privacy policy — /privacy.
 *
 * App Store Connect links here as the app's privacy policy URL, so the page
 * must stay publicly reachable: no auth, and prerendered like `/` so it is
 * real HTML without JavaScript. The same two prerender rules apply — no data
 * fetching, nothing user-specific or colour-scheme-branched in the template.
 *
 * The content mirrors what the system actually does; when the infrastructure
 * changes (a new provider, a new data category), this page changes in the
 * same PR. `app/pages/privacy.test.ts` pins the disclosures.
 */
<script setup lang="ts">
definePageMeta({ layout: 'marketing' })

const { appUrl } = useRuntimeConfig().public

const title = 'Privacy Policy'
const description
  = 'What DR. DUMBBELL collects, how it is used, where it is stored, '
    + 'and how to delete your account and data.'

// Baked in at build time — this page is prerendered. Same trade as `/`.
const origin = (appUrl ?? '').replace(/\/+$/, '')

useSeoMeta({
  title,
  description,
  ogType: 'article',
  ogUrl: origin ? `${origin}/privacy` : undefined,
  ogTitle: `${title} · DR. DUMBBELL`,
  ogDescription: description,
})

useHead({ link: origin ? [{ rel: 'canonical', href: `${origin}/privacy` }] : [] })

const CONTACT = 'graves.saul@gmail.com'
</script>

<template>
  <article class="mx-auto w-full max-w-column px-6 py-12 lg:px-10">
    <h1 class="text-large-title font-bold tracking-tight">Privacy Policy</h1>
    <p class="mt-2 text-footnote tnum text-label-tertiary">Last updated: August 24, 2026</p>

    <p class="mt-6 text-body leading-relaxed text-label-secondary">
      DR. DUMBBELL is a workout tracker for people following a structured
      strength program. This policy explains what data the app collects, how it
      is used, and the choices you have. It applies to the web app and the
      iOS app.
    </p>

    <section class="mt-10">
      <h2 class="text-title3 font-semibold">What we collect</h2>
      <div class="mt-3 space-y-4 text-body leading-relaxed text-label-secondary">
        <p>
          <strong class="font-semibold text-label">Account information.</strong>
          When you sign in with Google or Apple, we receive your email address,
          name, and profile picture from the sign-in provider. If you create an
          account with an email address and password instead, we store your
          email address and the name you provide; your password is hashed and
          managed by our authentication service (Supabase) and is never stored
          in readable form.
        </p>
        <p>
          <strong class="font-semibold text-label">Workout data.</strong>
          The data you create as you use the app: programs you save, workout
          sessions you complete, and the sets, reps, weights, and notes you log.
        </p>
        <p>
          <strong class="font-semibold text-label">Push notification tokens.</strong>
          If you enable notifications in the iOS app, we store the device token
          Apple assigns to your device so notifications can be delivered to it.
        </p>
        <p>
          <strong class="font-semibold text-label">Logs and diagnostics.</strong>
          Our servers keep operational logs of API requests — including your
          IP address and basic request metadata — used for security, rate
          limiting, and debugging. If the app encounters an error, technical
          details (such as device model, OS version, and the error itself,
          associated with your user ID) may be sent to our error-monitoring
          service to help us fix bugs.
        </p>
      </div>
    </section>

    <section class="mt-10">
      <h2 class="text-title3 font-semibold">How we use it</h2>
      <p class="mt-3 text-body leading-relaxed text-label-secondary">
        Your data is used solely to provide the app's functionality — signing
        you in, tracking your progress, and syncing your workout history across
        devices. We do not sell your data, share it with third parties for
        marketing, or use it for advertising. The app contains no ads and no
        third-party advertising or analytics trackers.
      </p>
    </section>

    <section class="mt-10">
      <h2 class="text-title3 font-semibold">Where your data lives</h2>
      <p class="mt-3 text-body leading-relaxed text-label-secondary">
        Your data is stored and processed by a small number of infrastructure
        providers acting on our behalf:
      </p>
      <ul class="mt-3 list-disc space-y-2 pl-5 text-body leading-relaxed text-label-secondary">
        <li>
          <strong class="font-semibold text-label">Supabase</strong> — database
          hosting (PostgreSQL) and email/password authentication.
        </li>
        <li>
          <strong class="font-semibold text-label">Vercel</strong> — application
          hosting and server request logs.
        </li>
        <li>
          <strong class="font-semibold text-label">Sentry</strong> — error
          monitoring and diagnostics.
        </li>
        <li>
          <strong class="font-semibold text-label">Upstash</strong> — rate
          limiting on sign-in endpoints, which briefly processes IP addresses.
        </li>
        <li>
          <strong class="font-semibold text-label">Google and Apple</strong> —
          sign-in, if you choose them. We do not send your workout data to
          either.
        </li>
      </ul>
      <p class="mt-3 text-body leading-relaxed text-label-secondary">
        These providers process data only to run the service; none of them may
        use your data for their own purposes.
      </p>
    </section>

    <section class="mt-10">
      <h2 class="text-title3 font-semibold">Cookies</h2>
      <p class="mt-3 text-body leading-relaxed text-label-secondary">
        The web app sets a single encrypted session cookie to keep you signed
        in. There are no advertising or cross-site tracking cookies.
      </p>
    </section>

    <section class="mt-10">
      <h2 class="text-title3 font-semibold">Data retention and deletion</h2>
      <p class="mt-3 text-body leading-relaxed text-label-secondary">
        We keep your data for as long as your account exists. You can
        permanently delete your account and all associated data at any time
        from Settings&nbsp;→ Delete&nbsp;Account in the app — deletion is
        immediate. You can also request deletion by emailing
        <a :href="`mailto:${CONTACT}`" class="text-tint hover:underline">{{ CONTACT }}</a> —
        we will remove your data within 30 days.
      </p>
    </section>

    <section class="mt-10">
      <h2 class="text-title3 font-semibold">Children</h2>
      <p class="mt-3 text-body leading-relaxed text-label-secondary">
        The app is not directed at children under 13, and we do not knowingly
        collect data from them. If you believe a child has created an account,
        contact us and we will delete it.
      </p>
    </section>

    <section class="mt-10">
      <h2 class="text-title3 font-semibold">Changes to this policy</h2>
      <p class="mt-3 text-body leading-relaxed text-label-secondary">
        If this policy changes, we will post the updated version here and
        revise the date at the top of the page.
      </p>
    </section>

    <section class="mt-10">
      <h2 class="text-title3 font-semibold">Contact</h2>
      <p class="mt-3 text-body leading-relaxed text-label-secondary">
        Questions about this policy can be sent to
        <a :href="`mailto:${CONTACT}`" class="text-tint hover:underline">{{ CONTACT }}</a>.
      </p>
    </section>
  </article>
</template>
