/**
 * Tests for server/api/auth/apple.ts
 *
 * Coverage strategy:
 *  - OAuth config: correct scopes
 *  - onSuccess: email from payload (authoritative) vs user fallback vs missing email
 *  - onSuccess: name composition — both names, first-only, none (subsequent logins)
 *  - onSuccess: name NOT overwritten in update when absent (delegated to findOrLinkUser)
 *  - onSuccess: session fields and redirect target
 *  - onSuccess/onError: oauth.failure logging, the derived cause, and the rid
 *    appended to the redirect for log correlation
 *  - default export: the per-request wrapper that supplies redirectURL (closing
 *    the library's authorize-vs-exchange asymmetry) and logs runtime config
 *    presence without leaking values
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { User } from '@prisma/client'

import appleHandler, { appleOAuthConfig } from './apple'

// ── Types ─────────────────────────────────────────────────────────────────────
type AppleUserName = { firstName?: string; lastName?: string }
type AppleUser = { email?: string; name?: AppleUserName }
/**
 * What Apple can actually put in the `user` field, as opposed to what the
 * library's types claim. It is a JSON *string* on the first authorization (the
 * callback is form-urlencoded, so `readBody` does not parse it), and absent on
 * every sign-in after that. Modelling it as a plain object is what let the
 * production 500 through, so the test type deliberately admits all three.
 */
type AppleUserField = AppleUser | string | undefined
type ApplePayload = { sub: string; email?: string }
type OAuthAppleConfig = {
  config: { scope: string[] }
  onSuccess: (
    event: unknown,
    payload: { user: AppleUserField; payload: ApplePayload },
  ) => Promise<unknown>
  onError: (event: unknown, error: Error) => unknown
}

const config = appleOAuthConfig as unknown as OAuthAppleConfig

// ── Stubbed globals ───────────────────────────────────────────────────────────
const mockFindOrLinkUser = findOrLinkUser as ReturnType<typeof vi.fn>
const mockSetUserSession = setUserSession as ReturnType<typeof vi.fn>
const mockSendRedirect = sendRedirect as ReturnType<typeof vi.fn>

// ── Mock data ─────────────────────────────────────────────────────────────────
const mockPayload: ApplePayload = {
  sub: 'apple-sub-001',
  email: 'apple@example.com',
}

const mockUserWithName: AppleUser = {
  name: { firstName: 'Jane', lastName: 'Appleseed' },
}

const mockDbUser = {
  id: 'clapple001',
  email: 'apple@example.com',
  name: 'Jane Appleseed',
  avatarUrl: null,
  ptRoutineInWorkout: false,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies User

function makeEvent() {
  return { path: '/api/auth/apple', context: {} }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('Apple OAuth handler (/api/auth/apple)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSetUserSession.mockResolvedValue(undefined)
    mockSendRedirect.mockResolvedValue(undefined)
  })

  describe('OAuth config', () => {
    test('requests name and email scopes', () => {
      expect(config.config.scope).toEqual(['name', 'email'])
    })
  })

  describe('onSuccess — email resolution', () => {
    test('uses payload.email as the authoritative email source', async () => {
      mockFindOrLinkUser.mockResolvedValueOnce(mockDbUser)

      await config.onSuccess(makeEvent(), {
        user: mockUserWithName,
        payload: mockPayload,
      })

      expect(mockFindOrLinkUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'apple@example.com' }),
      )
    })

    /**
     * findOrLinkUser links accounts by email and documents that the caller must
     * have verified it with the provider. The `user` field is form-post body
     * data, so honouring its email would let anyone holding a valid code link
     * into an arbitrary account. Only the id_token claim is trusted.
     */
    test('never links using an email supplied in the request body', async () => {
      const event = makeEvent()

      await config.onSuccess(event, {
        user: { email: 'attacker-controlled@example.com' },
        payload: { sub: 'apple-sub-002' },
      })

      expect(mockFindOrLinkUser).not.toHaveBeenCalled()
      expect(mockSendRedirect).toHaveBeenCalledWith(event, '/login?error=apple_no_email')
    })

    test('ignores a body email even when it is the same as a real account', async () => {
      await config.onSuccess(makeEvent(), {
        user: JSON.stringify({ email: 'apple@example.com' }),
        payload: { sub: 'apple-sub-002' },
      })

      expect(mockFindOrLinkUser).not.toHaveBeenCalled()
    })

    test('redirects to /login?error=apple_no_email when no email exists in payload or user', async () => {
      const event = makeEvent()

      await config.onSuccess(event, {
        user: {},
        payload: { sub: 'apple-sub-003' },
      })

      expect(mockSendRedirect).toHaveBeenCalledWith(event, '/login?error=apple_no_email')
    })

    test('does not call findOrLinkUser or setUserSession when email is missing', async () => {
      await config.onSuccess(makeEvent(), {
        user: {},
        payload: { sub: 'apple-sub-003' },
      })

      expect(mockFindOrLinkUser).not.toHaveBeenCalled()
      expect(mockSetUserSession).not.toHaveBeenCalled()
    })
  })

  /**
   * Regression tests for the production 500 (Sentry DR-DUMBBELL-NUXT-4):
   * `TypeError: Cannot read properties of undefined (reading 'name')`.
   *
   * Apple form-posts `user` only on the FIRST authorization, so every later
   * sign-in arrived as `{ code }` alone. `user.name?.firstName` guarded `name`
   * but not `user`, and sat outside the try block — so the throw bypassed
   * onError and became an unhandled 500 on POST /api/auth/apple.
   */
  describe('onSuccess — Apple user field shapes', () => {
    test('survives a repeat sign-in where Apple omits the user field', async () => {
      mockFindOrLinkUser.mockResolvedValueOnce(mockDbUser)
      const event = makeEvent()

      await config.onSuccess(event, { user: undefined, payload: mockPayload })

      expect(mockSendRedirect).toHaveBeenCalledWith(event, '/home')
      expect(mockFindOrLinkUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'apple@example.com', name: undefined }),
      )
    })

    test('does not report a failure when the user field is absent', async () => {
      mockFindOrLinkUser.mockResolvedValueOnce(mockDbUser)

      await config.onSuccess(makeEvent(), { user: undefined, payload: mockPayload })

      expect(logger.error).not.toHaveBeenCalled()
    })

    // The callback is form-urlencoded, so readBody yields `user` as a raw JSON
    // string. Treating it as an object silently dropped the name on first login.
    test('parses the user field when Apple sends it as a JSON string', async () => {
      mockFindOrLinkUser.mockResolvedValueOnce(mockDbUser)

      await config.onSuccess(makeEvent(), {
        user: JSON.stringify({ name: { firstName: 'Jane', lastName: 'Appleseed' } }),
        payload: mockPayload,
      })

      expect(mockFindOrLinkUser).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Jane Appleseed' }),
      )
    })

    test('falls back to the payload email when the user field is malformed JSON', async () => {
      mockFindOrLinkUser.mockResolvedValueOnce(mockDbUser)
      const event = makeEvent()

      await config.onSuccess(event, { user: '{not json', payload: mockPayload })

      expect(mockSendRedirect).toHaveBeenCalledWith(event, '/home')
    })

    test('redirects to apple_no_email when neither payload nor an absent user has an email', async () => {
      const event = makeEvent()

      await config.onSuccess(event, { user: undefined, payload: { sub: 'apple-sub-009' } })

      expect(mockSendRedirect).toHaveBeenCalledWith(event, '/login?error=apple_no_email')
    })
  })

  describe('onSuccess — name handling', () => {
    test('combines firstName and lastName into a full name string', async () => {
      mockFindOrLinkUser.mockResolvedValueOnce(mockDbUser)

      await config.onSuccess(makeEvent(), {
        user: { name: { firstName: 'Jane', lastName: 'Appleseed' } },
        payload: mockPayload,
      })

      expect(mockFindOrLinkUser).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Jane Appleseed' }),
      )
    })

    test('uses only firstName when lastName is absent', async () => {
      mockFindOrLinkUser.mockResolvedValueOnce({ ...mockDbUser, name: 'Jane' })

      await config.onSuccess(makeEvent(), {
        user: { name: { firstName: 'Jane' } },
        payload: mockPayload,
      })

      expect(mockFindOrLinkUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'Jane' }))
    })

    // Apple only sends the name on the very first login. The route maps an
    // absent name to `undefined` so findOrLinkUser skips updating it on
    // subsequent logins, preserving whatever's already on the User row.
    test('passes name=undefined to findOrLinkUser when Apple provides no name', async () => {
      mockFindOrLinkUser.mockResolvedValueOnce({ ...mockDbUser, name: 'Jane Appleseed' })

      await config.onSuccess(makeEvent(), {
        user: {},
        payload: mockPayload,
      })

      const arg = mockFindOrLinkUser.mock.calls[0]?.[0] as { name?: string | null }
      expect(arg.name).toBeUndefined()
    })
  })

  describe('onSuccess — provider profile', () => {
    test('calls findOrLinkUser with the apple provider and providerId', async () => {
      mockFindOrLinkUser.mockResolvedValueOnce(mockDbUser)

      await config.onSuccess(makeEvent(), {
        user: mockUserWithName,
        payload: mockPayload,
      })

      expect(mockFindOrLinkUser).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'apple',
          providerId: 'apple-sub-001',
        }),
      )
    })
  })

  describe('onSuccess — session and redirect', () => {
    test('sets user session with the returned db user fields', async () => {
      mockFindOrLinkUser.mockResolvedValueOnce(mockDbUser)
      const event = makeEvent()

      await config.onSuccess(event, {
        user: mockUserWithName,
        payload: mockPayload,
      })

      expect(mockSetUserSession).toHaveBeenCalledWith(event, {
        user: {
          id: 'clapple001',
          email: 'apple@example.com',
          name: 'Jane Appleseed',
          avatarUrl: null,
        },
      })
    })

    test('redirects to /home after successful login', async () => {
      mockFindOrLinkUser.mockResolvedValueOnce(mockDbUser)
      const event = makeEvent()

      await config.onSuccess(event, {
        user: mockUserWithName,
        payload: mockPayload,
      })

      expect(mockSendRedirect).toHaveBeenCalledWith(event, '/home')
    })
  })

  describe('onError', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleSpy.mockRestore()
    })

    test('redirects to /login?error=apple_failed', () => {
      const event = makeEvent()
      config.onError(event, new Error('apple error'))
      expect(mockSendRedirect).toHaveBeenCalledWith(event, '/login?error=apple_failed')
    })

    test('appends the requestId so the page maps to one log line', () => {
      const event = { path: '/api/auth/apple', context: { requestId: 'req-abc' } }
      config.onError(event, new Error('apple error'))
      expect(mockSendRedirect).toHaveBeenCalledWith(event, '/login?error=apple_failed&rid=req-abc')
    })

    test('logs oauth.failure with a cause', () => {
      const event = makeEvent()
      const err = new Error('id token invalid')

      config.onError(event, err)

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err, provider: 'apple', stage: 'callback', cause: expect.any(String) }),
        'oauth.failure',
      )
    })

    /**
     * The regression test for the original bug: Apple's `invalid_client` used to
     * be swallowed by pino's serializer (ofetch's non-enumerable getters) and by
     * nuxt-auth-utils' "Unknown error" message. It must now reach the log.
     */
    test('names invalid_client from a wrapped FetchError', () => {
      const fetchError = new Error('[POST] "https://appleid.apple.com/auth/token": 400 Bad Request')
      fetchError.name = 'FetchError'
      Object.defineProperty(fetchError, 'data', { get: () => ({ error: 'invalid_client' }) })
      Object.defineProperty(fetchError, 'status', { get: () => 400 })

      const wrapped = Object.assign(new Error('Apple login failed: Unknown error'), {
        statusCode: 401,
        data: fetchError,
      })

      config.onError(makeEvent(), wrapped)

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ cause: 'oauth_invalid_client' }),
        'oauth.failure',
      )
    })
  })

  describe('onSuccess — failure path', () => {
    test('tags the upsert failure with stage and requestId', async () => {
      mockFindOrLinkUser.mockRejectedValueOnce(new Error('db down'))
      const event = { path: '/api/auth/apple', context: { requestId: 'req-xyz' } }

      await config.onSuccess(event, { user: mockUserWithName, payload: mockPayload })

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ stage: 'upsert' }),
        'oauth.failure',
      )
      expect(mockSendRedirect).toHaveBeenCalledWith(event, '/login?error=apple_failed&rid=req-xyz')
    })
  })

  describe('default export — per-request wrapper', () => {
    const wrapperEvent = () => ({ path: '/api/auth/apple', method: 'GET', context: {} })

    /**
     * Set the runtime config per test rather than leaning on the global default.
     * Deliberately supplies a partial config — the point of these tests is what
     * the handler does when a var is missing — so the full RuntimeConfig shape
     * is asserted away here rather than stubbed out in full.
     */
    const withAppleConfig = (apple: Record<string, unknown>) => {
      vi.mocked(useRuntimeConfig).mockReturnValue(
        { oauth: { apple } } as unknown as ReturnType<typeof useRuntimeConfig>,
      )
    }

    test('passes the configured redirectURL through to the library', async () => {
      withAppleConfig({ redirectURL: 'https://fitness-app.me/api/auth/apple' })

      await appleHandler(wrapperEvent() as never)

      expect(defineOAuthAppleEventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            redirectURL: 'https://fitness-app.me/api/auth/apple',
            scope: ['name', 'email'],
          }),
        }),
      )
    })

    /**
     * Without this fallback the library sends `redirect_uri=` at the token
     * exchange (it has no fallback there, unlike at the authorize step), which
     * Apple answers with invalid_grant after the user has already consented.
     */
    test('falls back to the request origin when the env var is missing', async () => {
      withAppleConfig({ redirectURL: '' })

      await appleHandler(wrapperEvent() as never)

      expect(defineOAuthAppleEventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            redirectURL: 'http://localhost:3000/api/auth/apple',
          }),
        }),
      )
    })

    test('logs runtime config presence without leaking values', async () => {
      withAppleConfig({
        redirectURL: 'https://fitness-app.me/api/auth/apple',
        clientId: 'me.app.web',
        privateKey: '-----BEGIN PRIVATE KEY-----\nSECRETBODY\n-----END PRIVATE KEY-----',
      })

      await appleHandler(wrapperEvent() as never)

      const logged = vi.mocked(logger.debug).mock.calls.find(([, msg]) => msg === 'apple.oauth.config')?.[0]
      expect(logged).toMatchObject({
        clientIdSet: true,
        privateKeySet: true,
        privateKeyFormat: 'pkcs8',
        redirectURLSet: true,
        redirectURLFromRequestHost: false,
      })
      expect(JSON.stringify(logged)).not.toContain('SECRETBODY')
    })

    test('invokes the library handler with the original event', async () => {
      const event = wrapperEvent()
      withAppleConfig({ redirectURL: 'https://fitness-app.me/api/auth/apple' })

      await appleHandler(event as never)

      const built = vi.mocked(defineOAuthAppleEventHandler).mock.results.at(-1)?.value
      expect(built).toHaveBeenCalledWith(event)
    })

    // An entirely absent oauth.apple block is the shape a misconfigured runtime
    // actually has — not merely an empty redirectURL string.
    test('falls back to the request origin when oauth.apple is absent entirely', async () => {
      vi.mocked(useRuntimeConfig).mockReturnValue({} as unknown as ReturnType<typeof useRuntimeConfig>)

      await appleHandler(wrapperEvent() as never)

      expect(defineOAuthAppleEventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            redirectURL: 'http://localhost:3000/api/auth/apple',
          }),
        }),
      )
    })

    /**
     * Regression: nuxt-auth-utils compares the Content-Type header with strict
     * equality, so Safari's `; charset=UTF-8` made it treat Apple's callback as
     * a fresh initiation and redirect the user back to Apple — a cross-origin
     * bounce the browser blocks, with no error raised anywhere.
     */
    describe('form Content-Type normalisation', () => {
      const postEvent = (contentType?: string) => ({
        path: '/api/auth/apple',
        method: 'POST',
        context: {},
        node: { req: { headers: contentType ? { 'content-type': contentType } : {} } },
      })

      test.each([
        'application/x-www-form-urlencoded; charset=UTF-8',
        'application/x-www-form-urlencoded;charset=utf-8',
        'Application/X-WWW-Form-Urlencoded; charset=UTF-8',
      ])('collapses %s to the bare media type', async (contentType) => {
        const event = postEvent(contentType)
        vi.mocked(getRequestHeader).mockReturnValueOnce(contentType)

        await appleHandler(event as never)

        expect(event.node.req.headers['content-type']).toBe('application/x-www-form-urlencoded')
      })

      test('leaves an already-bare form type untouched', async () => {
        const event = postEvent('application/x-www-form-urlencoded')
        vi.mocked(getRequestHeader).mockReturnValueOnce('application/x-www-form-urlencoded')

        await appleHandler(event as never)

        expect(event.node.req.headers['content-type']).toBe('application/x-www-form-urlencoded')
      })

      test('does not touch an unrelated content type', async () => {
        const event = postEvent('application/json')
        vi.mocked(getRequestHeader).mockReturnValueOnce('application/json')

        await appleHandler(event as never)

        expect(event.node.req.headers['content-type']).toBe('application/json')
      })

      test('tolerates a request with no content-type at all', async () => {
        const event = postEvent()
        vi.mocked(getRequestHeader).mockReturnValueOnce(undefined)

        await expect(appleHandler(event as never)).resolves.toBeDefined()
      })
    })

    test('adds remediation and masked forensics when the key format is bad', async () => {
      // The exact production mistake: the PEM body with its armor lines stripped.
      withAppleConfig({
        redirectURL: 'https://fitness-app.me/api/auth/apple',
        privateKey: 'MIGTAgEA'.padEnd(200, 'A'),
      })

      await appleHandler(wrapperEvent() as never)

      // A bad format is promoted to `info` so it survives production log levels.
      const logged = vi.mocked(logger.info).mock.calls
        .find(([, msg]) => msg === 'apple.oauth.config')?.[0] as Record<string, unknown>

      expect(logged.privateKeyFormat).toBe('pem-body-only')
      expect(logged.privateKeyProblem).toContain('BEGIN PRIVATE KEY')
      expect(logged.privateKeyForensics).toBeDefined()
      // Key material is masked even in the failure path.
      expect(JSON.stringify(logged)).not.toContain('AAAAAAAAAAAAAAAAAAAA')
    })

    test('omits the remediation fields when the key format is fine', async () => {
      withAppleConfig({
        redirectURL: 'https://fitness-app.me/api/auth/apple',
        privateKey: '-----BEGIN PRIVATE KEY-----\nMIGT\n-----END PRIVATE KEY-----',
      })

      await appleHandler(wrapperEvent() as never)

      const logged = vi.mocked(logger.debug).mock.calls
        .find(([, msg]) => msg === 'apple.oauth.config')?.[0] as Record<string, unknown>

      expect(logged.privateKeyProblem).toBeUndefined()
      expect(logged.privateKeyForensics).toBeUndefined()
    })
  })
})
