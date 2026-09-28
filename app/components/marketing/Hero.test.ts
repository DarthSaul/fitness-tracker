import { describe, test, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import Hero from './Hero.vue'
import { APP_STORE_URL } from '../../utils/app-store'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

const NuxtLinkStub = {
  name: 'NuxtLink',
  props: { to: { type: String, required: true } },
  template: '<a :href="to"><slot /></a>',
}

/**
 * Renders `to` as an href so link targets are assertable, and clicks emit.
 * `emits` must be declared, or `click` both falls through as a native listener
 * and emits, calling the parent handler twice.
 */
const UButtonStub = {
  name: 'UButton',
  props: ['to', 'label', 'icon', 'size', 'color', 'variant'],
  emits: ['click'],
  template: '<a v-if="to" :href="to">{{ label }}</a><button v-else @click="$emit(\'click\')">{{ label }}</button>',
}

function mountHero() {

  return mount(Hero, {
    global: {
      stubs: {
        UIcon: true,
        NuxtLink: NuxtLinkStub,
        UButton: UButtonStub,
        AppCard: { template: '<div><slot /></div>' },
        MarketingAppStoreBadge: { template: `<a href="${APP_STORE_URL}">Download on the App Store</a>` },
      },
    },
  })
}

describe('MarketingHero', () => {
  test('renders exactly one h1', () => {
    const headings = mountHero().findAll('h1')

    expect(headings).toHaveLength(1)
    expect(headings[0]!.text()).toBe("Follow plans you'll love. Log workouts with ease. Track your gains.")
  })

  describe('the artwork', () => {
    test('offers both sources so it stays sharp at 2x', () => {
      const srcset = mountHero().find('img').attributes('srcset')

      expect(srcset).toContain('/img/login-hero.jpg 640w')
      expect(srcset).toContain('/img/login-hero@2x.jpg 940w')
    })

    // Without intrinsic dimensions the hero reflows on load, which is the one
    // Lighthouse metric a landing page cannot afford to fail.
    test('declares intrinsic dimensions to prevent layout shift', () => {
      const img = mountHero().find('img')

      expect(img.attributes('width')).toBe('640')
      expect(img.attributes('height')).toBe('1137')
    })

    test('carries real alt text rather than being hidden', () => {
      const img = mountHero().find('img')

      expect(img.attributes('alt')).toBeTruthy()
      expect(img.attributes('aria-hidden')).toBeUndefined()
    })
  })

  describe('calls to action', () => {
    // The header already offers Sign in; the hero pitches new users only.
    test('offers Get started (signup) and no Sign in', () => {
      const links = mountHero().findAll('a')
      const byLabel = Object.fromEntries(links.map(a => [a.text(), a.attributes('href')]))

      expect(byLabel['Get started']).toBe('/login?signup=1')
      expect(mountHero().text()).not.toContain('Sign in')
    })

    test('no longer starts Google sign-in directly', () => {
      expect(mountHero().text()).not.toContain('Continue with Google')
    })

    test('links to the App Store', () => {
      const hrefs = mountHero().findAll('a').map(a => a.attributes('href'))

      expect(hrefs).toContain(APP_STORE_URL)
    })

    test('carries no fine print under the CTAs', () => {
      const text = mountHero().text()

      expect(text).not.toContain('Sign in with Apple is available too')
      expect(text).not.toContain('On iPhone and the web')
    })
  })
})
