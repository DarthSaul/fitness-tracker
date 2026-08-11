/**
 * Count-up rest timer for between sets.
 *
 * Elapsed time is derived from wall-clock stamps rather than accumulated
 * ticks, so a backgrounded tab — which throttles `setInterval` heavily on
 * mobile — resumes showing the true elapsed time instead of a timer that
 * silently ran slow.
 */
export function useRestTimer() {
  const elapsedMs = ref(0)
  const running = ref(false)

  let startedAt: number | null = null
  let accumulatedMs = 0
  let handle: ReturnType<typeof setInterval> | null = null

  function tick(): void {
    if (startedAt === null) return
    elapsedMs.value = accumulatedMs + (Date.now() - startedAt)
  }

  function start(): void {
    if (running.value) return
    startedAt = Date.now()
    running.value = true
    handle = setInterval(tick, 250)
  }

  function pause(): void {
    if (!running.value) return
    tick()
    accumulatedMs = elapsedMs.value
    startedAt = null
    running.value = false
    if (handle) {
      clearInterval(handle)
      handle = null
    }
  }

  function reset(): void {
    pause()
    accumulatedMs = 0
    elapsedMs.value = 0
  }

  function toggle(): void {
    running.value ? pause() : start()
  }

  const seconds = computed(() => Math.floor(elapsedMs.value / 1000))

  /** m:ss, matching the iOS timer's monospaced readout. */
  const display = computed(() => {
    const total = seconds.value
    const mins = Math.floor(total / 60)
    const secs = total % 60
    return `${mins}:${String(secs).padStart(2, '0')}`
  })

  onUnmounted(() => {
    if (handle) clearInterval(handle)
  })

  return { elapsedMs, seconds, display, running, start, pause, reset, toggle }
}
