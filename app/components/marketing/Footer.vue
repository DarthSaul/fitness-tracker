/**
 * Marketing footer.
 *
 * No app-store or download badges: the iOS client is TestFlight-only, and a
 * badge a reader cannot act on is worse than none.
 *
 * Section anchors are root-anchored (`/#features`) because this footer also
 * renders on /privacy, where a bare fragment would scroll nowhere.
 */
<script setup lang="ts">
const config = useRuntimeConfig()

const product = [
  { label: 'Features', to: '/#features' },
  { label: 'How it works', to: '/#how-it-works' },
  { label: 'Progress', to: '/#progress' },
]

const account = [
  { label: 'Sign in', to: '/login' },
  { label: 'Create an account', to: '/login?signup=1' },
]

const legal = [
  { label: 'Privacy Policy', to: '/privacy' },
]
</script>

<template>
  <footer class="border-t border-separator">
    <div class="mx-auto w-full max-w-frame px-6 py-12 lg:px-10">
      <div class="flex flex-col gap-10 sm:flex-row sm:justify-between">
        <div class="max-w-xs">
          <div class="flex items-center gap-2.5">
            <img src="/icons/icon-192.png" alt="" aria-hidden="true" class="size-7 rounded-chip">
            <span class="text-headline font-bold tracking-tight">DR. DUMBBELL</span>
          </div>
          <p class="mt-3 text-footnote text-label-secondary">
            A workout tracker for people following a structured strength program.
          </p>
        </div>

        <div class="flex gap-12">
          <div>
            <p class="text-caption font-semibold uppercase text-label-secondary">Product</p>
            <ul class="mt-3 space-y-2">
              <li v-for="link in product" :key="link.to">
                <a :href="link.to" class="text-subheadline text-label transition-colors hover:text-tint">
                  {{ link.label }}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p class="text-caption font-semibold uppercase text-label-secondary">Account</p>
            <ul class="mt-3 space-y-2">
              <li v-for="link in account" :key="link.to">
                <NuxtLink :to="link.to" class="text-subheadline text-label transition-colors hover:text-tint">
                  {{ link.label }}
                </NuxtLink>
              </li>
              <li>
                <a
                  href="https://github.com/DarthSaul/fitness-tracker"
                  rel="noopener"
                  class="text-subheadline text-label transition-colors hover:text-tint"
                >
                  Source on GitHub
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p class="text-caption font-semibold uppercase text-label-secondary">Legal</p>
            <ul class="mt-3 space-y-2">
              <li v-for="link in legal" :key="link.to">
                <NuxtLink :to="link.to" class="text-subheadline text-label transition-colors hover:text-tint">
                  {{ link.label }}
                </NuxtLink>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <p class="mt-10 text-caption tnum text-label-tertiary">
        © {{ new Date().getFullYear() }} DR. DUMBBELL · v{{ config.public.appVersion }}
      </p>
    </div>
  </footer>
</template>
