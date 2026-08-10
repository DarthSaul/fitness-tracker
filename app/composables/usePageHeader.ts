import type { RouteMeta } from 'vue-router'

export type PageHeader = NonNullable<RouteMeta['header']>

const STATE_KEY = 'page-header-override'

/**
 * Lets a page replace the static header it declared in `definePageMeta` once
 * its data arrives — a session detail cannot know its own title until it has
 * loaded.
 *
 * Writing to `route.meta` directly would mutate the shared route *record*, so
 * the title would leak into the next visit to the same dynamic route. This
 * override is cleared on unmount instead.
 */
export function usePageHeaderOverride() {
  return useState<PageHeader | null>(STATE_KEY, () => null)
}

/** Applies a reactive header override for as long as the caller is mounted. */
export function usePageHeader(header: () => PageHeader | null): void {
  const override = usePageHeaderOverride()

  watchEffect(() => {
    override.value = header()
  })

  onUnmounted(() => {
    override.value = null
  })
}
