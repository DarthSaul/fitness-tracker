import { describe, test, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import Hero from './Hero.vue'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

const signInWithGoogle = vi.fn()

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

function mountHero(appleAuthEnabled = false) {
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appleAuthEnabled } }))
  vi.stubGlobal('useAuth', () => ({ signInWithGoogle }))

  return mount(Hero, {
    global: {
      stubs: {
        UIcon: true,
        NuxtLink: NuxtLinkStub,
        UButton: UButtonStub,
        AppCard: { template: '<div><slot /></div>' },
      },
    },
  })
}

beforeEach(() => {
  signInWithGoogle.mockClear()
})

describe('MarketingHero', () => {
  test('renders exactly one h1', () => {
    const headings = mountHero().findAll('h1')

    expect(headings).toHaveLength(1)
    expect(headings[0]!.text()).toContain('Run the program')
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
    test('the primary CTA starts Google sign-in directly', async () => {
      const wrapper = mountHero()

      await wrapper.find('button').trigger('click')

      expect(signInWithGoogle).toHaveBeenCalledOnce()
    })

    // Keeps /login the single auth surface instead of growing a sibling page.
    test('the secondary CTA opens the signup form on /login', () => {
      const hrefs = mountHero().findAll('a').map(a => a.attributes('href'))

      expect(hrefs).toContain('/login?signup=1')
    })
  })

  describe('Apple sign-in', () => {
    test('is not mentioned when it is not configured', () => {
      expect(mountHero(false).text()).not.toContain('Apple')
    })

    test('is mentioned when it is configured', () => {
      expect(mountHero(true).text()).toContain('Apple')
    })
  })
})
