import { describe, test, expect } from 'vitest'

import { parseApnsDeviceToken } from './device-tokens'

const HEX_64 = 'a1b2c3d4'.repeat(8)

describe('parseApnsDeviceToken', () => {
  test.each([
    ['64 lowercase hex chars (today\'s APNs length)', HEX_64, HEX_64],
    ['a longer token (Apple says the length may grow)', 'ab'.repeat(100), 'ab'.repeat(100)],
  ])('accepts %s', (_label, token, expected) => {
    expect(parseApnsDeviceToken(token)).toBe(expected)
  })

  test('lowercases uppercase hex, so case variants are one device', () => {
    expect(parseApnsDeviceToken(HEX_64.toUpperCase())).toBe(HEX_64)
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
    expect(parseApnsDeviceToken(token)).toBeNull()
  })
})
