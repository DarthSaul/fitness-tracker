import { describe, test, expect, vi, beforeEach } from 'vitest'
import { ref, watchEffect, nextTick } from 'vue'
import type { Ref } from 'vue'
import { usePageHeader, usePageHeaderOverride } from './usePageHeader'
import type { PageHeader } from './usePageHeader'

const states = new Map<string, Ref<unknown>>()
let unmountCallbacks: Array<() => void> = []

function header(title: string): PageHeader {
  return { title } as PageHeader
}

describe('usePageHeader', () => {
  beforeEach(() => {
    states.clear()
    unmountCallbacks = []
    vi.stubGlobal('useState', (key: string, init: () => unknown) => {
      if (!states.has(key)) states.set(key, ref(init()))
      return states.get(key)
    })
    vi.stubGlobal('watchEffect', watchEffect)
    vi.stubGlobal('onUnmounted', (cb: () => void) => { unmountCallbacks.push(cb) })
  })

  test('the override starts empty', () => {
    expect(usePageHeaderOverride().value).toBeNull()
  })

  test('shares one override across callers', () => {
    usePageHeaderOverride().value = header('Shared')

    expect(usePageHeaderOverride().value).toEqual(header('Shared'))
  })

  test('applies the header the page supplies', () => {
    usePageHeader(() => header('Push Day'))

    expect(usePageHeaderOverride().value).toEqual(header('Push Day'))
  })

  test('updates the header when the page data it depends on changes', async () => {
    const title = ref('Loading')
    usePageHeader(() => header(title.value))
    expect(usePageHeaderOverride().value).toEqual(header('Loading'))

    title.value = 'Push Day'
    await nextTick()

    expect(usePageHeaderOverride().value).toEqual(header('Push Day'))
  })

  test('clears the override when the page unmounts so it does not leak to the next visit', () => {
    usePageHeader(() => header('Push Day'))

    unmountCallbacks.forEach(cb => cb())

    expect(usePageHeaderOverride().value).toBeNull()
  })
})
