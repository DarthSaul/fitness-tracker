/**
 * Tests for the isClientError predicate used by sentry.server.config.ts's
 * beforeSend hook. Importing the module is safe in tests: the Sentry.init()
 * block is gated on SENTRY_DSN, which is unset under vitest.
 */
import { describe, test, expect } from 'vitest'
import { isClientError } from './sentry.server.config'

describe('isClientError', () => {
  test('true for 4xx H3-style errors (dropped from Sentry)', () => {
    expect(isClientError({ statusCode: 400 })).toBe(true)
    expect(isClientError({ statusCode: 401 })).toBe(true) // expired iOS token
    expect(isClientError({ statusCode: 403 })).toBe(true)
    expect(isClientError({ statusCode: 404 })).toBe(true)
    expect(isClientError({ statusCode: 429 })).toBe(true) // rate limited
    expect(isClientError({ statusCode: 499 })).toBe(true)
  })

  test('false for 5xx errors (kept — actionable server bugs)', () => {
    expect(isClientError({ statusCode: 500 })).toBe(false)
    expect(isClientError({ statusCode: 502 })).toBe(false)
    expect(isClientError({ statusCode: 503 })).toBe(false)
  })

  test('false when there is no numeric statusCode (kept)', () => {
    expect(isClientError(new Error('boom'))).toBe(false)
    expect(isClientError({ statusCode: '401' })).toBe(false)
    expect(isClientError({})).toBe(false)
    expect(isClientError(null)).toBe(false)
    expect(isClientError(undefined)).toBe(false)
    expect(isClientError('Unauthorized')).toBe(false)
  })

  test('boundary: 399 kept, 400 dropped, 499 dropped, 500 kept', () => {
    expect(isClientError({ statusCode: 399 })).toBe(false)
    expect(isClientError({ statusCode: 400 })).toBe(true)
    expect(isClientError({ statusCode: 499 })).toBe(true)
    expect(isClientError({ statusCode: 500 })).toBe(false)
  })
})
