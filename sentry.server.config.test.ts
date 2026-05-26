/**
 * Tests for the isExpectedClientError predicate used by sentry.server.config.ts's
 * beforeSend hook. Importing the module is safe in tests: the Sentry.init()
 * block is gated on SENTRY_DSN, which is unset under vitest.
 */
import { describe, test, expect } from 'vitest'
import { isExpectedClientError } from './sentry.server.config'

describe('isExpectedClientError', () => {
  test('true for 401 (expired iOS access token — recovered via /auth/refresh)', () => {
    expect(isExpectedClientError({ statusCode: 401 })).toBe(true)
  })

  test('false for actionable 4xx (kept — surface in Sentry)', () => {
    expect(isExpectedClientError({ statusCode: 400 })).toBe(false) // validation bug on client
    expect(isExpectedClientError({ statusCode: 403 })).toBe(false) // unexpected authz failure
    expect(isExpectedClientError({ statusCode: 404 })).toBe(false) // bad client routing
    expect(isExpectedClientError({ statusCode: 409 })).toBe(false) // state-machine conflict
    expect(isExpectedClientError({ statusCode: 422 })).toBe(false)
    expect(isExpectedClientError({ statusCode: 429 })).toBe(false) // rate-limit pressure
    expect(isExpectedClientError({ statusCode: 499 })).toBe(false)
  })

  test('false for 5xx (always kept — actionable server bugs)', () => {
    expect(isExpectedClientError({ statusCode: 500 })).toBe(false)
    expect(isExpectedClientError({ statusCode: 502 })).toBe(false)
    expect(isExpectedClientError({ statusCode: 503 })).toBe(false)
  })

  test('false when there is no numeric statusCode (kept)', () => {
    expect(isExpectedClientError(new Error('boom'))).toBe(false)
    expect(isExpectedClientError({ statusCode: '401' })).toBe(false)
    expect(isExpectedClientError({})).toBe(false)
    expect(isExpectedClientError(null)).toBe(false)
    expect(isExpectedClientError(undefined)).toBe(false)
    expect(isExpectedClientError('Unauthorized')).toBe(false)
  })
})
