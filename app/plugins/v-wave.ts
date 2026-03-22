import VWave from 'v-wave'

export default defineNuxtPlugin((nuxtApp) => {
  if (import.meta.server) {
    // Register a no-op directive so SSR doesn't crash on v-wave
    nuxtApp.vueApp.directive('wave', {})
    return
  }

  nuxtApp.vueApp.use(VWave, {
    color: '#a78bfa',
    initialOpacity: 0.25,
    finalOpacity: 0.1,
    duration: 0.4,
    easing: 'ease-out',
  })
})
