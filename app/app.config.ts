/**
 * Nuxt UI theme configuration.
 *
 * The colour keys map onto the `--color-ios-*` ramps declared in
 * `app/assets/css/main.css`; @nuxt/ui's runtime plugin resolves each to shade
 * 500 in light and shade 400 in dark, which is exactly how Apple's semantic
 * colours are paired.
 *
 * The component overrides below exist because iOS composes surfaces
 * differently from Nuxt UI's defaults: cards are a flat 14pt fill with no
 * border and no shadow (depth comes from surface-vs-background contrast
 * alone), and inputs are a translucent fill rather than a ring.
 */
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'ios-blue',
      secondary: 'ios-purple',
      success: 'ios-green',
      info: 'ios-blue',
      warning: 'ios-orange',
      error: 'ios-red',
      neutral: 'ios-gray',
    },

    card: {
      slots: {
        root: 'rounded-card overflow-hidden',
        body: 'p-4 sm:p-4',
        header: 'p-4 sm:px-4',
        footer: 'p-4 sm:px-4',
      },
      variants: {
        variant: {
          // No ring, no divider — an iOS card is a bare fill.
          outline: { root: 'bg-surface ring-0 divide-y-0' },
          soft: { root: 'bg-surface divide-y-0' },
          subtle: { root: 'bg-surface ring-0 divide-y-0' },
        },
      },
    },

    // Bottom sheets read as iOS detents: top-rounded, no ring, visible grabber.
    drawer: {
      slots: {
        content: 'bg-surface-grouped ring-0',
        handle: 'bg-label-tertiary',
      },
    },

    modal: {
      slots: { content: 'rounded-panel ring-0 bg-surface-grouped' },
    },

    slideover: {
      slots: { content: 'ring-0 bg-surface-grouped' },
    },

    button: {
      slots: { base: 'rounded-chip font-medium' },
    },

    input: {
      slots: { base: 'rounded-chip' },
    },

    textarea: {
      slots: { base: 'rounded-chip' },
    },

    badge: {
      slots: { base: 'rounded-full font-semibold' },
    },
  },
})
