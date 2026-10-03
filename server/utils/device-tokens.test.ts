import { describe, test, expect } from 'vitest'

import { isApnsDeviceToken } from './device-tokens'

const HEX_64 = 'a1b2c3d4'.repeat(8)

describe('isApnsDeviceToken', () => {
  test.each([
    ['64 lowercase hex chars (today\'s APNs length)', HEX_64],
    ['uppercase hex', HEX_64.toUpperCase()],
    ['a longer token (Apple says the length may grow)', 'ab'.repeat(100)],
  ])('accepts %s', (_label, token) => {
    expect(isApnsDeviceToken(token)).toBe(true)
  })

  test.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 1234],
    ['an empty string', ''],
    ['too short', 'ab'.repeat(31)],
    ['too long', 'ab'.repeat(101)],
    ['non-hex characters', 'g'.repeat(64)],
    ['a path separator', `${'a'.repeat(32)}/${'a'.repeat(31)}`],
    ['a query string', `${'a'.repeat(63)}?`],
    ['surrounding whitespace', ` ${HEX_64} `],
  ])('rejects %s', (_label, token) => {
    expect(isApnsDeviceToken(token)).toBe(false)
  })
})
