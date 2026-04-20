export function useViewportFix(): void {
  if (!import.meta.client) return

  const vv = window.visualViewport
  if (!vv) return

  function update(): void {
    const bottomOffset = Math.max(0, window.innerHeight - vv!.offsetTop - vv!.height)
    document.documentElement.style.setProperty('--viewport-bottom-offset', `${bottomOffset}px`)
  }

  vv.addEventListener('resize', update, { passive: true })
  vv.addEventListener('scroll', update, { passive: true })
  update()

  onUnmounted(() => {
    vv.removeEventListener('resize', update)
    vv.removeEventListener('scroll', update)
  })
}
