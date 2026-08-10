import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, computed } from 'vue'
import { useRestTimer } from './useRestTimer'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
// The composable registers an unmount hook; outside a component instance Vue
// would warn, so swallow it.
vi.stubGlobal('onUnmounted', () => {})

describe('useRestTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('starts at zero', () => {
    const t = useRestTimer()

    expect(t.seconds.value).toBe(0)
    expect(t.display.value).toBe('0:00')
    expect(t.running.value).toBe(false)
  })

  test('counts up while running', () => {
    const t = useRestTimer()
    t.start()

    vi.advanceTimersByTime(5000)

    expect(t.seconds.value).toBe(5)
    expect(t.display.value).toBe('0:05')
  })

  test('formats minutes and pads seconds', () => {
    const t = useRestTimer()
    t.start()

    vi.advanceTimersByTime(95_000)

    expect(t.display.value).toBe('1:35')
  })

  test('holds its value while paused', () => {
    const t = useRestTimer()
    t.start()
    vi.advanceTimersByTime(3000)
    t.pause()

    vi.advanceTimersByTime(10_000)

    expect(t.seconds.value).toBe(3)
    expect(t.running.value).toBe(false)
  })

  test('resumes from where it paused', () => {
    const t = useRestTimer()
    t.start()
    vi.advanceTimersByTime(3000)
    t.pause()
    vi.advanceTimersByTime(10_000)
    t.start()
    vi.advanceTimersByTime(2000)

    expect(t.seconds.value).toBe(5)
  })

  test('reset returns to zero and stops', () => {
    const t = useRestTimer()
    t.start()
    vi.advanceTimersByTime(7000)
    t.reset()

    expect(t.seconds.value).toBe(0)
    expect(t.running.value).toBe(false)
  })

  test('toggle flips between running and paused', () => {
    const t = useRestTimer()

    t.toggle()
    expect(t.running.value).toBe(true)

    t.toggle()
    expect(t.running.value).toBe(false)
  })

  test('starting twice does not double-count', () => {
    const t = useRestTimer()
    t.start()
    t.start()

    vi.advanceTimersByTime(4000)

    expect(t.seconds.value).toBe(4)
  })

  // Mobile browsers throttle timers in background tabs; deriving from
  // wall-clock stamps means the readout is still correct on return.
  test('tracks wall-clock time even when ticks are missed', () => {
    const t = useRestTimer()
    t.start()

    vi.setSystemTime(new Date('2026-01-15T10:01:00.000Z'))
    vi.advanceTimersByTime(250)

    expect(t.seconds.value).toBe(60)
  })
})
