import { describe, test, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import Cta from './Cta.vue'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

const signInWithGoogle = vi.fn()

const NuxtLinkStub = {
  name: 'NuxtLink',
  props: { to: { type: String, required: true } },
  template: '<a :href="to"><slot /></a>',
}

/**
 * `emits` must be declared, or `click` both falls through as a native listener
 * and emits, calling the parent handler twice.
 */
const UButtonStub = {
  name: 'UButton',
  props: ['to', 'label', 'icon', 'size', 'color', 'variant'],
  emits: ['click'],
  template: '<a v-if="to" :href="to">{{ label }}</a><button v-else @click="$emit(\'click\')">{{ label }}</button>',
}

function mountCta() {
  vi.stubGlobal('useAuth', () => ({ signInWithGoogle }))

  return mount(Cta, {
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

describe('MarketingCta', () => {
  test('the primary CTA starts Google sign-in exactly once', async () => {
    const wrapper = mountCta()

    await wrapper.find('button').trigger('click')

    expect(signInWithGoogle).toHaveBeenCalledOnce()
  })

  test('offers an email route and a sign-in route for existing accounts', () => {
    const hrefs = mountCta().findAll('a').map(a => a.attributes('href'))

    expect(hrefs).toContain('/login?signup=1')
    expect(hrefs).toContain('/login')
  })
})
