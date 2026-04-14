import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { isEmailAllowed } from './allowList'

describe('isEmailAllowed', () => {
  const originalEnv = process.env.ALLOWED_EMAILS

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ALLOWED_EMAILS
    }
    else {
      process.env.ALLOWED_EMAILS = originalEnv
    }
  })

  test('returns false when ALLOWED_EMAILS is unset', () => {
    delete process.env.ALLOWED_EMAILS
    expect(isEmailAllowed('anyone@example.com')).toBe(false)
  })

  test('returns false when ALLOWED_EMAILS is empty string', () => {
    process.env.ALLOWED_EMAILS = ''
    expect(isEmailAllowed('anyone@example.com')).toBe(false)
  })

  test('returns false when ALLOWED_EMAILS is only whitespace', () => {
    process.env.ALLOWED_EMAILS = '   '
    expect(isEmailAllowed('anyone@example.com')).toBe(false)
  })

  test('returns true for an exact match', () => {
    process.env.ALLOWED_EMAILS = 'alice@example.com,bob@example.com'
    expect(isEmailAllowed('alice@example.com')).toBe(true)
    expect(isEmailAllowed('bob@example.com')).toBe(true)
  })

  test('is case-insensitive when input is uppercase', () => {
    process.env.ALLOWED_EMAILS = 'alice@example.com'
    expect(isEmailAllowed('ALICE@EXAMPLE.COM')).toBe(true)
  })

  test('is case-insensitive when list entry is uppercase', () => {
    process.env.ALLOWED_EMAILS = 'ALICE@EXAMPLE.COM'
    expect(isEmailAllowed('alice@example.com')).toBe(true)
  })

  test('strips whitespace from list entries', () => {
    process.env.ALLOWED_EMAILS = ' alice@example.com , bob@example.com '
    expect(isEmailAllowed('alice@example.com')).toBe(true)
    expect(isEmailAllowed('bob@example.com')).toBe(true)
  })

  test('strips whitespace from the input email', () => {
    process.env.ALLOWED_EMAILS = 'alice@example.com'
    expect(isEmailAllowed('  alice@example.com  ')).toBe(true)
  })

  test('returns false for an email not on the list', () => {
    process.env.ALLOWED_EMAILS = 'alice@example.com'
    expect(isEmailAllowed('eve@example.com')).toBe(false)
  })

  test('handles double-commas without creating phantom entries', () => {
    process.env.ALLOWED_EMAILS = 'alice@example.com,,bob@example.com'
    expect(isEmailAllowed('alice@example.com')).toBe(true)
    expect(isEmailAllowed('bob@example.com')).toBe(true)
    expect(isEmailAllowed('')).toBe(false)
  })
})
