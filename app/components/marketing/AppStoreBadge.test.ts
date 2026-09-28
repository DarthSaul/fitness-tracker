import { describe, test, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppStoreBadge from './AppStoreBadge.vue'
import { APP_STORE_URL } from '../../utils/app-store'

describe('MarketingAppStoreBadge', () => {
  test('links to the App Store listing in a new tab', () => {
    const link = mount(AppStoreBadge).find('a')

    expect(link.attributes('href')).toBe(APP_STORE_URL)
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
  })

  test('uses the official badge with its label as alt text', () => {
    const img = mount(AppStoreBadge).find('img')

    expect(img.attributes('src')).toBe('/img/app-store-badge.svg')
    expect(img.attributes('alt')).toBe('Download on the App Store')
  })

  // The page gets Lighthoused; an image without intrinsic size shifts layout.
  test('declares intrinsic dimensions to prevent layout shift', () => {
    const img = mount(AppStoreBadge).find('img')

    expect(img.attributes('width')).toBeTruthy()
    expect(img.attributes('height')).toBe('48')
  })
})
