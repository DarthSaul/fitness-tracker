/**
 * Tests for server/utils/oauth-error.ts
 *
 * Coverage strategy:
 *  - extractOAuthErrorDetail: one fixture per real-world error shape that the
 *    Apple/Google OAuth flow can produce, asserting the derived `cause`
 *  - the load-bearing fixture is `makeFetchError`, which reproduces ofetch's
 *    NON-ENUMERABLE getters exactly. A fixture with plain enumerable properties
 *    would pass while the production bug (pino's serializer dropping Apple's
 *    error body) persisted, so faithfulness here is the whole point.
 *  - redaction: the minted client secret, the authorization code and the jose
 *    payload (end-user PII) must never survive into the extracted detail
 *  - reportOAuthFailure: log shape, Sentry capture, and the guarantee that the
 *    synthetic error is NOT dropped by sentry.server.config's 401 filter
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import * as Sentry from '@sentry/nuxt'
import * as joseErrors from 'jose/errors'

import { extractOAuthErrorDetail, reportOAuthFailure, type OAuthFailureCause } from './oauth-error'
import { isExpectedClientError } from '../../sentry.server.config'

/**
 * Stands in for h3's `createError`. h3 is a transitive dependency and is not
 * resolvable from the test, so the H3Error shape is reproduced directly:
 * `statusCode`, `message` and `data` are declared as class fields on h3's
 * H3Error, which makes them own ENUMERABLE properties — the reason pino's
 * serializer recurses into `data` while ofetch's getters stay invisible.
 */
function createH3Error(options: { statusCode: number; message: string; data?: unknown }): Error {
  const error = new Error(options.message)
  error.name = 'H3Error'
  return Object.assign(error, { statusCode: options.statusCode, data: options.data })
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * Reproduces ofetch@1.5.1's `createFetchError` faithfully: `data`, `status`,
 * `statusText`, `request`, `options` and `response` are defined with
 * `Object.defineProperty` and a bare getter, so they are NON-ENUMERABLE.
 * `for (const key in err)` — which pino's serializer uses — cannot see them.
 */
function makeFetchError(options: {
  status: number
  statusText?: string
  body?: unknown
  url?: string
  requestBody?: string
}): Error {
  const url = options.url ?? 'https://appleid.apple.com/auth/token'
  const response = {
    status: options.status,
    statusText: options.statusText ?? 'Bad Request',
    _data: options.body,
  }
  const ctx = {
    request: url,
    options: { method: 'POST', body: options.requestBody },
    response,
  }

  const error = new Error(`[POST] ${JSON.stringify(url)}: ${response.status} ${response.statusText}`)
  error.name = 'FetchError'

  for (const key of ['request', 'options', 'response'] as const) {
    Object.defineProperty(error, key, { get: () => ctx[key] })
  }
  for (const [key, refKey] of [
    ['data', '_data'],
    ['status', 'status'],
    ['statusCode', 'status'],
    ['statusText', 'statusText'],
  ] as const) {
    Object.defineProperty(error, key, {
      get: () => (response as unknown as Record<string, unknown>)[refKey],
    })
  }
  return error
}

/**
 * Reproduces what nuxt-auth-utils' `handleAccessTokenErrorResponse` does with a
 * *thrown* error: wraps it in an H3Error whose message degrades to
 * "Unknown error" because a FetchError has no `.error_description`/`.error`.
 */
function wrapLikeNuxtAuthUtils(thrown: unknown): Error {
  return createH3Error({
    statusCode: 401,
    message: 'Apple login failed: Unknown error',
    data: thrown,
  })
}

const APPLE_SECRET_JWT = 'eyJhbGciOiJFUzI1NiIsImtpZCI6IktFWTEyMzQ1NjcifQ.eyJpc3MiOiJURUFNMTIzNDU2In0.sig'
const APPLE_CODE = 'c4f8SECRETCODEvalue'
const TOKEN_REQUEST_BODY = `client_id=me.app.web&client_secret=${APPLE_SECRET_JWT}&code=${APPLE_CODE}`

// ── extractOAuthErrorDetail ───────────────────────────────────────────────────

describe('extractOAuthErrorDetail', () => {
  describe('Apple OAuth error bodies (the case the current logs lose)', () => {
    test('reads invalid_client through the H3Error → FetchError → body chain', () => {
      const detail = extractOAuthErrorDetail(
        wrapLikeNuxtAuthUtils(makeFetchError({
          status: 400,
          body: { error: 'invalid_client' },
        })),
      )

      expect(detail.cause).toBe('oauth_invalid_client')
      expect(detail.oauthError).toBe('invalid_client')
      expect(detail.httpStatus).toBe(400)
      expect(detail.statusCode).toBe(401)
    })

    test('reads invalid_grant', () => {
      const detail = extractOAuthErrorDetail(
        wrapLikeNuxtAuthUtils(makeFetchError({
          status: 400,
          body: { error: 'invalid_grant', error_description: 'The code has expired.' },
        })),
      )

      expect(detail.cause).toBe('oauth_invalid_grant')
      expect(detail.oauthErrorDescription).toBe('The code has expired.')
    })

    test('reads invalid_request', () => {
      const detail = extractOAuthErrorDetail(
        wrapLikeNuxtAuthUtils(makeFetchError({ status: 400, body: { error: 'invalid_request' } })),
      )
      expect(detail.cause).toBe('oauth_invalid_request')
    })

    test('falls back to a generic OAuth cause for an unrecognised error code', () => {
      const detail = extractOAuthErrorDetail(
        wrapLikeNuxtAuthUtils(makeFetchError({ status: 400, body: { error: 'slow_down' } })),
      )
      expect(detail.cause).toBe('oauth_error')
      expect(detail.oauthError).toBe('slow_down')
    })

    test('reports the HTTP status when the body carries no OAuth error code', () => {
      const detail = extractOAuthErrorDetail(
        wrapLikeNuxtAuthUtils(makeFetchError({ status: 503, statusText: 'Service Unavailable' })),
      )
      expect(detail.cause).toBe('token_endpoint_http')
      expect(detail.httpStatus).toBe(503)
    })
  })

  describe('jose errors', () => {
    test('maps a non-string token to id_token_missing, not a malformed id_token', () => {
      // Real path: requestAccessToken swallows a 401 and returns Apple's error
      // body, so `id_token` is undefined and verifyJwt(undefined) throws this.
      const detail = extractOAuthErrorDetail(
        wrapLikeNuxtAuthUtils(
          new joseErrors.JWSInvalid('Compact JWS must be a string or Uint8Array'),
        ),
      )
      expect(detail.cause).toBe('id_token_missing')
    })

    test('maps an aud mismatch to id_token_audience', () => {
      const detail = extractOAuthErrorDetail(
        wrapLikeNuxtAuthUtils(
          new joseErrors.JWTClaimValidationFailed(
            'unexpected "aud" claim value',
            { sub: 'apple-sub-001', email: 'user@example.com' },
            'aud',
            'check_failed',
          ),
        ),
      )
      expect(detail.cause).toBe('id_token_audience')
      expect(detail.joseClaim).toBe('aud')
    })

    test('maps an iss mismatch to id_token_issuer', () => {
      const detail = extractOAuthErrorDetail(
        wrapLikeNuxtAuthUtils(
          new joseErrors.JWTClaimValidationFailed('unexpected "iss"', {}, 'iss', 'check_failed'),
        ),
      )
      expect(detail.cause).toBe('id_token_issuer')
    })

    test('maps an expired id_token', () => {
      const detail = extractOAuthErrorDetail(
        wrapLikeNuxtAuthUtils(new joseErrors.JWTExpired('token expired', {}, 'exp', 'check_failed')),
      )
      expect(detail.cause).toBe('id_token_expired')
    })

    test('maps a JWKS failure to jwks_unavailable', () => {
      const detail = extractOAuthErrorDetail(
        wrapLikeNuxtAuthUtils(new joseErrors.JWKSNoMatchingKey()),
      )
      expect(detail.cause).toBe('jwks_unavailable')
    })
  })

  describe('private key failures', () => {
    test('classifies importPKCS8 TypeError as bad_private_key', () => {
      const detail = extractOAuthErrorDetail(
        wrapLikeNuxtAuthUtils(new TypeError('"pkcs8" must be PKCS#8 formatted string')),
      )
      expect(detail.cause).toBe('bad_private_key')
      expect(detail.errorName).toBe('TypeError')
    })

    test('classifies an ASN.1 parse failure as bad_private_key', () => {
      const detail = extractOAuthErrorDetail(
        wrapLikeNuxtAuthUtils(new Error('Invalid PKCS#8 structure')),
      )
      expect(detail.cause).toBe('bad_private_key')
    })
  })

  describe('other shapes', () => {
    test('classifies the missing-config H3Error', () => {
      const detail = extractOAuthErrorDetail(
        createH3Error({
          statusCode: 500,
          message: 'Missing NUXT_OAUTH_APPLE_TEAM_ID or NUXT_OAUTH_APPLE_KEY_ID env variables.',
        }),
      )
      expect(detail.cause).toBe('missing_config')
      expect(detail.statusCode).toBe(500)
    })

    test('classifies a Prisma error', () => {
      const prismaError = Object.assign(new Error('Unique constraint failed'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2002',
        meta: { target: ['email'] },
      })
      const detail = extractOAuthErrorDetail(prismaError)
      expect(detail.cause).toBe('db_error')
      expect(detail.prismaCode).toBe('P2002')
    })

    test('classifies a network error', () => {
      const detail = extractOAuthErrorDetail(
        wrapLikeNuxtAuthUtils(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })),
      )
      expect(detail.cause).toBe('network')
      expect(detail.networkCode).toBe('ENOTFOUND')
    })

    test.each([
      ['a plain Error', new Error('boom')],
      ['a string', 'boom'],
      ['null', null],
      ['undefined', undefined],
      ['a number', 42],
    ])('does not throw on %s', (_label, input) => {
      expect(() => extractOAuthErrorDetail(input)).not.toThrow()
      expect(extractOAuthErrorDetail(input).cause).toBe('unknown')
    })

    test('terminates on a self-referential error', () => {
      const error = new Error('loop') as Error & { data?: unknown }
      error.data = error
      expect(() => extractOAuthErrorDetail(error)).not.toThrow()
    })

    test('truncates a very long message', () => {
      const detail = extractOAuthErrorDetail(new Error('x'.repeat(10_000)))
      expect(detail.message.length).toBeLessThanOrEqual(301)
    })

    test('every result is JSON round-trippable', () => {
      const detail = extractOAuthErrorDetail(
        wrapLikeNuxtAuthUtils(makeFetchError({ status: 400, body: { error: 'invalid_client' } })),
      )
      expect(() => JSON.parse(JSON.stringify(detail))).not.toThrow()
    })
  })

  describe('redaction', () => {
    test('never leaks the client secret or the authorization code', () => {
      const detail = extractOAuthErrorDetail(
        wrapLikeNuxtAuthUtils(makeFetchError({
          status: 400,
          body: { error: 'invalid_client' },
          url: `https://appleid.apple.com/auth/token?code=${APPLE_CODE}`,
          requestBody: TOKEN_REQUEST_BODY,
        })),
      )

      const serialized = JSON.stringify(detail)
      expect(serialized).not.toContain(APPLE_SECRET_JWT)
      expect(serialized).not.toContain(APPLE_CODE)
      expect(serialized).not.toContain('client_secret')
      // The upstream URL is still reported, but with the query string stripped.
      expect(detail.httpUrl).toBe('https://appleid.apple.com/auth/token')
    })

    test('never leaks the end user PII carried on a jose claim failure', () => {
      const detail = extractOAuthErrorDetail(
        wrapLikeNuxtAuthUtils(
          new joseErrors.JWTClaimValidationFailed(
            'unexpected "aud" claim value',
            { sub: 'apple-sub-001', email: 'user@example.com' },
            'aud',
            'check_failed',
          ),
        ),
      )

      const serialized = JSON.stringify(detail)
      expect(serialized).not.toContain('apple-sub-001')
      expect(serialized).not.toContain('user@example.com')
    })
  })
})

// ── reportOAuthFailure ────────────────────────────────────────────────────────

describe('reportOAuthFailure', () => {
  const mockLogger = { error: vi.fn() }
  const makeEvent = (requestId?: string) => ({
    context: { requestId, logger: mockLogger },
  }) as never

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('logs oauth.failure with the cause hoisted to the top level', () => {
    reportOAuthFailure(
      makeEvent('req-1'),
      'apple',
      'callback',
      wrapLikeNuxtAuthUtils(makeFetchError({ status: 400, body: { error: 'invalid_client' } })),
    )

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'apple',
        stage: 'callback',
        cause: 'oauth_invalid_client',
        requestId: 'req-1',
      }),
      'oauth.failure',
    )
  })

  test('returns the requestId so the caller can put it on the redirect', () => {
    expect(reportOAuthFailure(makeEvent('req-2'), 'apple', 'upsert', new Error('x'))).toBe('req-2')
  })

  test('returns an empty string when there is no requestId', () => {
    expect(reportOAuthFailure(makeEvent(undefined), 'apple', 'upsert', new Error('x'))).toBe('')
  })

  test('reports to Sentry with the cause as a tag', () => {
    reportOAuthFailure(
      makeEvent('req-3'),
      'google',
      'callback',
      wrapLikeNuxtAuthUtils(makeFetchError({ status: 400, body: { error: 'invalid_grant' } })),
    )

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ oauth_cause: 'oauth_invalid_grant', oauth_provider: 'google' }),
      }),
    )
  })

  test('the captured error survives the Sentry 401 filter', () => {
    // handleAccessTokenErrorResponse stamps statusCode 401 on every OAuth
    // failure, which isExpectedClientError drops on purpose (routine iOS token
    // expiry). The synthetic error must carry no statusCode so the report gets
    // through WITHOUT weakening that filter. This fails the moment someone
    // captures the original H3Error instead.
    reportOAuthFailure(
      makeEvent('req-4'),
      'apple',
      'callback',
      wrapLikeNuxtAuthUtils(makeFetchError({ status: 400, body: { error: 'invalid_client' } })),
    )

    const captured = vi.mocked(Sentry.captureException).mock.calls[0]?.[0]
    expect(isExpectedClientError(captured)).toBe(false)
  })
})

describe('extractOAuthErrorDetail — credentials outside a URL', () => {
  test('redacts bare client_secret and code values in a message', () => {
    const detail = extractOAuthErrorDetail(
      new Error(`token request failed client_secret=${APPLE_SECRET_JWT} code=${APPLE_CODE} retrying`),
    )

    expect(detail.message).not.toContain(APPLE_SECRET_JWT)
    expect(detail.message).not.toContain(APPLE_CODE)
    // The key names survive so the message still reads sensibly.
    expect(detail.message).toContain('client_secret=[REDACTED]')
    expect(detail.message).toContain('code=[REDACTED]')
  })
})

describe('extractOAuthErrorDetail — code classification', () => {
  const NETWORK_CODES: Array<[code: string, expected: OAuthFailureCause]> = [
    ['ENOTFOUND', 'network'],
    ['ECONNRESET', 'network'],
    ['UND_ERR_CONNECT_TIMEOUT', 'network'],
  ]

  test.each(NETWORK_CODES)('treats %s as a network code', (code, expected) => {
    const detail = extractOAuthErrorDetail(Object.assign(new Error('boom'), { code }))
    expect(detail.cause).toBe(expected)
    expect(detail.networkCode).toBe(code)
  })

  // An unrecognised library code used to be recorded as a network error, which
  // sends triage looking at connectivity for a problem that is not there.
  test('does not label an unknown library code as a network error', () => {
    const detail = extractOAuthErrorDetail(
      Object.assign(new Error('library exploded'), { code: 'SOME_LIB_FAILURE' }),
    )

    expect(detail.networkCode).toBeUndefined()
    expect(detail.cause).toBe('unknown')
    expect(detail.message).toContain('library exploded')
  })

  // Structured codes are authoritative; the private-key check is a message
  // heuristic whose tokens a database error could plausibly contain.
  test('prefers a Prisma code over a private-key message match', () => {
    const detail = extractOAuthErrorDetail(
      Object.assign(new Error('Invalid keyData in column'), { code: 'P2002' }),
    )

    expect(detail.cause).toBe('db_error')
  })
})

describe('reportOAuthFailure — synthetic error retains the original', () => {
  test('carries the innermost error as cause', () => {
    const inner = new Error('[POST] "https://appleid.apple.com/auth/token": 400 Bad Request')
    reportOAuthFailure(
      { context: { requestId: 'req-9', logger: { error: vi.fn() } } } as never,
      'apple',
      'callback',
      wrapLikeNuxtAuthUtils(inner),
    )

    const captured = vi.mocked(Sentry.captureException).mock.calls.at(-1)?.[0] as Error
    expect(captured.cause).toBe(inner)
    expect(captured.name).toBe('OAuthFailure')
  })
})

// ── Remaining branches ────────────────────────────────────────────────────────

describe('extractOAuthErrorDetail — remaining classifications', () => {
  /** An Error carrying a jose-style `code` (and optional claim). */
  function joseLike(code: string, extra: Record<string, unknown> = {}): Error {
    return Object.assign(new Error('jose failure'), { code, ...extra })
  }

  test.each([
    ['ERR_JWK_INVALID', 'bad_private_key'],
    ['ERR_JWKS_NO_MATCHING_KEY', 'jwks_unavailable'],
    ['ERR_JWKS_INVALID', 'jwks_unavailable'],
    ['ERR_JWKS_TIMEOUT', 'jwks_unavailable'],
    ['ERR_JWKS_MULTIPLE_MATCHING_KEYS', 'jwks_unavailable'],
    ['ERR_JWS_SIGNATURE_VERIFICATION_FAILED', 'id_token_signature'],
    ['ERR_JOSE_NOT_SUPPORTED', 'jose_error'],
  ] as [string, OAuthFailureCause][])('maps %s to %s', (code, cause) => {
    expect(extractOAuthErrorDetail(joseLike(code)).cause).toBe(cause)
  })

  test('maps a claim failure on an unrelated claim to jose_error', () => {
    const detail = extractOAuthErrorDetail(joseLike('ERR_JWT_CLAIM_VALIDATION_FAILED', { claim: 'nonce', reason: 'check_failed' }))

    expect(detail.cause).toBe('jose_error')
    expect(detail.joseClaim).toBe('nonce')
    expect(detail.joseReason).toBe('check_failed')
  })

  test('maps an invalid JWT with a different message to jose_error', () => {
    expect(extractOAuthErrorDetail(joseLike('ERR_JWT_INVALID')).cause).toBe('jose_error')
  })

  test('does not record an unrecognised library code', () => {
    const detail = extractOAuthErrorDetail(Object.assign(new Error('boom'), { code: 'SOMETHING_ELSE' }))

    expect(detail.networkCode).toBeUndefined()
    expect(detail.prismaCode).toBeUndefined()
    expect(detail.joseCode).toBeUndefined()
    expect(detail.cause).toBe('unknown')
  })

  test('reads the pre-parsed response body when the error carries no data', () => {
    const error = Object.assign(new Error('bad'), { response: { _data: { error: 'invalid_client', error_description: 'nope' } } })
    const detail = extractOAuthErrorDetail(error)

    expect(detail.cause).toBe('oauth_invalid_client')
    expect(detail.oauthErrorDescription).toBe('nope')
  })

  test('detects an H3Error by its constructor marker', () => {
    class MarkedError extends Error {
      static __h3_error__ = true
      statusCode = 500
      status = 500
    }
    const detail = extractOAuthErrorDetail(new MarkedError('Missing NUXT_OAUTH_APPLE_CLIENT_ID'))

    expect(detail.statusCode).toBe(500)
    expect(detail.cause).toBe('missing_config')
  })

  test('names a plain object by its own name property', () => {
    const detail = extractOAuthErrorDetail({ name: 'CustomShape', message: 'plain' })

    expect(detail.errorName).toBe('CustomShape')
    expect(detail.message).toBe('plain')
  })

  test('falls back to "Object" for a plain object without a name', () => {
    expect(extractOAuthErrorDetail({ message: 'plain' }).errorName).toBe('Object')
  })

  test('describes a non-object throw by its type and string value', () => {
    const detail = extractOAuthErrorDetail('just a string')

    expect(detail.errorName).toBe('string')
    expect(detail.message).toBe('just a string')
    expect(detail.cause).toBe('unknown')
  })

  test('yields an empty message for a nullish throw', () => {
    expect(extractOAuthErrorDetail(undefined).message).toBe('')
  })
})

describe('reportOAuthFailure — fallbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('logs through the global logger when the event has no request-scoped logger', () => {
    reportOAuthFailure({ context: {} } as never, 'google', 'upsert', new Error('x'))

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google', stage: 'upsert', route: '/api/auth/google', requestId: '' }),
      'oauth.failure',
    )
  })

  test('captures a synthetic error with no cause when the failure is not an Error', () => {
    reportOAuthFailure({ context: { requestId: 'r' } } as never, 'apple', 'callback', 'plain string')

    const captured = vi.mocked(Sentry.captureException).mock.calls.at(-1)?.[0] as Error
    expect(captured.message).toBe('apple oauth failed: unknown')
    expect(captured.cause).toBeUndefined()
  })

  test('uses the error itself as the cause when it carries no inner data', () => {
    const error = new Error('direct')
    reportOAuthFailure({ context: { requestId: 'r' } } as never, 'apple', 'upsert', error)

    const captured = vi.mocked(Sentry.captureException).mock.calls.at(-1)?.[0] as Error
    expect(captured.cause).toBe(error)
  })
})
