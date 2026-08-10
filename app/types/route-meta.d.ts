/**
 * Per-page chrome for the `app` layout.
 *
 * Tab roots declare a `large` header, which the layout renders in the scroll
 * flow (and mirrors into the floating title chip once the user scrolls) —
 * matching how iOS drops the navigation bar on tab roots in favour of
 * `ScreenTitleHeader`. Pushed screens declare `inline`, which renders a
 * compact sticky bar with a back button instead.
 */
declare module 'vue-router' {
  interface RouteMeta {
    header?: {
      title: string
      /** Mirrors the tab's icon. Large headers only. */
      emoji?: string
      subtitle?: string
      style?: 'large' | 'inline'
    }
  }
}

export {}
