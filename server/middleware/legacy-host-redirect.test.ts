/**
 * Tests for server/middleware/legacy-host-redirect.ts
 *
 * Coverage strategy:
 *  - web GETs on a legacy host 308 to the same path + query on appUrl
 *  - /api/**, non-GET/HEAD methods and the primary host pass through
 *  - empty legacyHosts and empty appUrl are no-ops that never throw
 *  - the missing-appUrl warning fires once per instance, not per request
 *  - a legacy host that is also the appUrl host does not self-redirect
 *
 * `getRequestHost` is not in vitest.setup.ts, so it is stubbed here. The module
 * holds a warn-once flag, so it is re-imported fresh for every test.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

type Event = { method: string; path: string; context: Record<string, unknown> }
type Handler = (event: Event) => unknown

const mockSendRedirect = sendRedirect as ReturnType<typeof vi.fn>
const mockUseRuntimeConfig = useRuntimeConfig as ReturnType<typeof vi.fn>
const mockGetRequestHost = vi.fn()
vi.stubGlobal('getRequestHost', mockGetRequestHost)

function withConfig(legacyHosts: string, appUrl: string): void {
  mockUseRuntimeConfig.mockReturnValue({ legacyHosts, public: { appUrl } })
}

function makeEvent(path: string, method = 'GET'): Event {
  return { method, path, context: {} }
}

let handler: Handler

describe('server/middleware/legacy-host-redirect', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    handler = (await import('./legacy-host-redirect')).default as unknown as Handler
    mockSendRedirect.mockImplementation(() => 'redirected')
    withConfig('fitness-app.me', 'https://drdumbbell.app')
    mockGetRequestHost.mockReturnValue('fitness-app.me')
  })

  test('308s a legacy-host page to the same path and query on appUrl', () => {
    const event = makeEvent('/home?foo=1')
    expect(handler(event)).toBe('redirected')
    expect(mockSendRedirect).toHaveBeenCalledWith(event, 'https://drdumbbell.app/home?foo=1', 308)
  })

  test('reads the host through X-Forwarded-Host', () => {
    handler(makeEvent('/home'))
    expect(mockGetRequestHost).toHaveBeenCalledWith(expect.anything(), { xForwardedHost: true })
  })

  test('redirects HEAD as well as GET', () => {
    handler(makeEvent('/privacy', 'HEAD'))
    expect(mockSendRedirect).toHaveBeenCalledWith(expect.anything(), 'https://drdumbbell.app/privacy', 308)
  })

  test('matches a legacy host case-insensitively and ignores a port', () => {
    mockGetRequestHost.mockReturnValue('Fitness-App.me:443')
    handler(makeEvent('/'))
    expect(mockSendRedirect).toHaveBeenCalledWith(expect.anything(), 'https://drdumbbell.app/', 308)
  })

  test('matches any entry in a comma-separated list', () => {
    withConfig('old.example, fitness-app.me', 'https://drdumbbell.app')
    handler(makeEvent('/home'))
    expect(mockSendRedirect).toHaveBeenCalledOnce()
  })

  test('drops a trailing slash on appUrl so the path is not doubled', () => {
    withConfig('fitness-app.me', 'https://drdumbbell.app/')
    handler(makeEvent('/home'))
    expect(mockSendRedirect).toHaveBeenCalledWith(expect.anything(), 'https://drdumbbell.app/home', 308)
  })

  test('serves /api/** on a legacy host directly', () => {
    expect(handler(makeEvent('/api/programs'))).toBeUndefined()
    expect(mockSendRedirect).not.toHaveBeenCalled()
  })

  test('does not redirect a POST on a legacy host', () => {
    expect(handler(makeEvent('/auth/something', 'POST'))).toBeUndefined()
    expect(mockSendRedirect).not.toHaveBeenCalled()
  })

  test('serves the primary host normally', () => {
    mockGetRequestHost.mockReturnValue('drdumbbell.app')
    expect(handler(makeEvent('/home'))).toBeUndefined()
    expect(mockSendRedirect).not.toHaveBeenCalled()
  })

  test('is a no-op for every host when legacyHosts is empty', () => {
    withConfig('', 'https://drdumbbell.app')
    for (const host of ['fitness-app.me', 'drdumbbell.app', 'localhost:3000']) {
      mockGetRequestHost.mockReturnValue(host)
      expect(handler(makeEvent('/home'))).toBeUndefined()
    }
    expect(mockSendRedirect).not.toHaveBeenCalled()
  })

  test('passes through without throwing when appUrl is empty, warning only once', () => {
    withConfig('fitness-app.me', '')
    expect(() => handler(makeEvent('/home'))).not.toThrow()
    expect(() => handler(makeEvent('/history'))).not.toThrow()
    expect(mockSendRedirect).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledOnce()
  })

  test('does not loop when the appUrl host is itself listed as legacy', () => {
    withConfig('drdumbbell.app', 'https://drdumbbell.app')
    mockGetRequestHost.mockReturnValue('drdumbbell.app')
    expect(handler(makeEvent('/home'))).toBeUndefined()
    expect(mockSendRedirect).not.toHaveBeenCalled()
  })

  test('passes through when appUrl is not a parseable URL', () => {
    withConfig('fitness-app.me', 'not a url')
    expect(handler(makeEvent('/home'))).toBeUndefined()
    expect(mockSendRedirect).not.toHaveBeenCalled()
  })
})
