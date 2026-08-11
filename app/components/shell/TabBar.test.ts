/**
 * Characterisation tests for the mobile tab bar.
 *
 * These describe the bar exactly as it was inlined in `app/layouts/app.vue`
 * before it was extracted into a component — they are what proves the
 * extraction changed nothing. Below `lg` the rendered DOM should stay
 * byte-identical to what shipped.
 */
import { describe, test, expect, vi, afterEach } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import TabBar from './TabBar.vue'

// vitest.setup.ts stubs ref/computed for composable tests; restore real Vue
// reactivity so the component's setup() runs correctly when mounted.
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

const NuxtLinkStub = {
  name: 'NuxtLink',
  props: { to: { type: String, required: true } },
  template: '<a :href="to"><slot /></a>',
}

function mountTabBar(path = '/') {
  vi.stubGlobal('useRoute', () => ({ path }))
  return mount(TabBar, { global: { stubs: { UIcon: true, NuxtLink: NuxtLinkStub } } })
}

afterEach(() => {
  vi.stubGlobal('useRoute', vi.fn(() => ({ path: '/' })))
})

describe('ShellTabBar', () => {
  test('renders the five tabs in order, each linked and labelled', () => {
    const links = mountTabBar().findAll('a')

    expect(links).toHaveLength(5)
    expect(links.map(link => link.text())).toEqual([
      'Home',
      'History',
      'Analytics',
      'Programs',
      'Settings',
    ])
    expect(links.map(link => link.attributes('href'))).toEqual([
      '/',
      '/history',
      '/analytics',
      '/programs',
      '/settings',
    ])
  })

  // Matched on the attribute rather than the stub's tag name, which is an
  // implementation detail of vue-test-utils' stub factory.
  test('renders an icon per tab', () => {
    const icons = mountTabBar().findAll('[name^="i-lucide-"]')

    expect(icons).toHaveLength(5)
    expect(icons.map(icon => icon.attributes('name'))).toEqual([
      'i-lucide-house',
      'i-lucide-history',
      'i-lucide-trending-up',
      'i-lucide-dumbbell',
      'i-lucide-settings',
    ])
  })

  describe('active state', () => {
    test('tints the active tab and marks it as the current page', () => {
      const home = mountTabBar('/').findAll('a')[0]!

      expect(home.classes()).toContain('text-tint')
      expect(home.attributes('aria-current')).toBe('page')
    })

    test('leaves inactive tabs untinted and unmarked', () => {
      const history = mountTabBar('/').findAll('a')[1]!

      expect(history.classes()).toContain('text-label-secondary')
      expect(history.classes()).not.toContain('text-tint')
      expect(history.attributes('aria-current')).toBeUndefined()
    })

    test('a tab stays active on its nested detail screens', () => {
      const links = mountTabBar('/history/abc').findAll('a')
      const current = links.filter(link => link.attributes('aria-current') === 'page')

      expect(current).toHaveLength(1)
      expect(current[0]!.text()).toBe('History')
    })

    // Home is matched exactly; a prefix match would light it on every route.
    test('Home is not active on another tab', () => {
      const home = mountTabBar('/analytics').findAll('a')[0]!

      expect(home.attributes('aria-current')).toBeUndefined()
    })

    /**
     * `/program` (Manage Program) is reached from Home but lives outside every
     * tab's path, so nothing lights up. Today's behaviour, kept deliberately —
     * the breadcrumb is what orients the user on those screens.
     */
    test('no tab is active on a screen that belongs to no tab', () => {
      const links = mountTabBar('/program').findAll('a')

      expect(links.filter(link => link.attributes('aria-current') === 'page')).toHaveLength(0)
    })
  })

  describe('chrome', () => {
    test('is a nav with the translucent material treatment', () => {
      const nav = mountTabBar().find('nav')

      expect(nav.exists()).toBe(true)
      for (const cls of ['border-t', 'border-separator', 'bg-material', 'backdrop-blur-2xl']) {
        expect(nav.classes()).toContain(cls)
      }
    })

    // The `env(safe-area-inset-bottom)` padding that clears the home indicator
    // is deliberately not asserted: happy-dom's CSS parser discards `env()`,
    // so the style attribute never survives to be inspected. Verified visually.

    test('keeps the tab row at the phone column width', () => {
      expect(mountTabBar().find('nav > div').classes()).toContain('max-w-lg')
    })
  })
})
