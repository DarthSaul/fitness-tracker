import { describe, test, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import Footer from './Footer.vue'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

const NuxtLinkStub = {
  name: 'NuxtLink',
  props: { to: { type: String, required: true } },
  template: '<a :href="to"><slot /></a>',
}

function mountFooter() {
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appVersion: '1.4.2' } }))
  return mount(Footer, { global: { stubs: { NuxtLink: NuxtLinkStub } } })
}

describe('MarketingFooter', () => {
  /**
   * The executable form of a product decision: the iOS client is TestFlight
   * only, so there is nothing for a store badge to link to. This test is what
   * stops one being added back by reflex.
   */
  test('advertises no app store or download', () => {
    const html = mountFooter().html()

    expect(html).not.toContain('apps.apple.com')
    expect(html).not.toContain('play.google.com')
    expect(html).not.toContain('testflight')
    expect(html.toLowerCase()).not.toContain('download on the')
    expect(html.toLowerCase()).not.toContain('app store')
  })

  test('links to sign-in and signup', () => {
    const hrefs = mountFooter().findAll('a').map(a => a.attributes('href'))

    expect(hrefs).toContain('/login')
    expect(hrefs).toContain('/login?signup=1')
  })

  test('links to the privacy policy', () => {
    const hrefs = mountFooter().findAll('a').map(a => a.attributes('href'))

    expect(hrefs).toContain('/privacy')
  })

  /**
   * The section anchors must be root-anchored: the footer now also renders on
   * /privacy, where a bare `#features` would resolve to /privacy#features and
   * scroll nowhere.
   */
  test('section anchors point back at the landing page', () => {
    const hrefs = mountFooter().findAll('a').map(a => a.attributes('href'))

    expect(hrefs).toContain('/#features')
    expect(hrefs).toContain('/#how-it-works')
    expect(hrefs).toContain('/#progress')
  })

  test('links to the public source repository', () => {
    const hrefs = mountFooter().findAll('a').map(a => a.attributes('href'))

    expect(hrefs).toContain('https://github.com/DarthSaul/fitness-tracker')
  })

  test('shows the running app version', () => {
    expect(mountFooter().text()).toContain('v1.4.2')
  })
})
