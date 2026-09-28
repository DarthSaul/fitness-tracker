import { describe, test, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import Cta from './Cta.vue'
import { APP_STORE_URL } from '../../utils/app-store'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

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
  return mount(Cta, {
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

describe('MarketingCta', () => {
  // The closing card has one job: send a new visitor to signup.
  test('offers only the Get started CTA, pointing at signup', () => {
    const links = mountCta().findAll('a')

    expect(links.map(a => [a.text(), a.attributes('href')])).toEqual([['Get started', '/login?signup=1']])
  })

  test('offers neither Sign in nor the App Store badge', () => {
    const wrapper = mountCta()

    expect(wrapper.text()).not.toContain('Sign in')
    expect(wrapper.findAll('a').map(a => a.attributes('href'))).not.toContain(APP_STORE_URL)
  })
})
