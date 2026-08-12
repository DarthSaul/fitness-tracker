/**
 * Tests for server/utils/apple-key.ts
 *
 * Coverage strategy:
 *  - every ApplePrivateKeyFormat member, derived from a REAL generated ES256
 *    key rather than a hand-written string, so the "good" cases stay honest
 *  - the two usable formats return no remediation; every other one does
 *  - the classification never echoes key material
 */
import { describe, test, expect } from 'vitest'
import * as jose from 'jose'

import {
  classifyApplePrivateKey,
  describeApplePrivateKeyValue,
  explainApplePrivateKeyFormat,
  type ApplePrivateKeyFormat,
} from './apple-key'

// A genuine P-256 PKCS#8 PEM — the shape Apple's .p8 files actually have.
const { privateKey } = await jose.generateKeyPair('ES256', { extractable: true })
const PEM = await jose.exportPKCS8(privateKey)

describe('classifyApplePrivateKey', () => {
  test('accepts a raw PKCS#8 PEM', () => {
    expect(classifyApplePrivateKey(PEM)).toBe('pkcs8')
  })

  test('accepts a PEM with escaped newlines, which the library expands', () => {
    expect(classifyApplePrivateKey(PEM.replace(/\n/g, '\\n'))).toBe('pkcs8-escaped-newlines')
  })

  test.each([
    ['double quotes', `"${PEM}"`],
    ['single quotes', `'${PEM}'`],
  ])('flags a value wrapped in %s', (_label, value) => {
    expect(classifyApplePrivateKey(value)).toBe('quoted')
  })

  test('flags leading whitespace — jose requires the banner at index 0', () => {
    expect(classifyApplePrivateKey(`\n${PEM}`)).toBe('leading-whitespace')
  })

  test('flags an SEC1 key', () => {
    expect(classifyApplePrivateKey('-----BEGIN EC PRIVATE KEY-----\nMHc=\n-----END EC PRIVATE KEY-----'))
      .toBe('sec1')
  })

  test('flags an RSA key', () => {
    expect(classifyApplePrivateKey('-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----'))
      .toBe('pkcs1')
  })

  test('flags a base64 blob — the NUXT_APNS_PRIVATE_KEY convention applied to the wrong var', () => {
    expect(classifyApplePrivateKey(Buffer.from(PEM).toString('base64'))).toBe('base64-blob')
  })

  // Both mistakes are all-base64 and indistinguishable by eye, but need
  // opposite fixes: one is over-encoded, the other under-armored.
  test('distinguishes the PEM body from a base64-encoded whole file', () => {
    const bodyOnly = PEM.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '')

    expect(classifyApplePrivateKey(bodyOnly)).toBe('pem-body-only')
    expect(classifyApplePrivateKey(Buffer.from(PEM).toString('base64'))).toBe('base64-blob')
  })

  // Regression: the base64 branch required >200 chars, so a P-256 body of
  // exactly 200 fell through to 'unknown' and reported nothing useful.
  test('classifies a body of exactly 200 characters', () => {
    expect(classifyApplePrivateKey('MIGTAgEA'.padEnd(200, 'A'))).toBe('pem-body-only')
  })

  test('re-armoring a body-only value yields a key jose accepts', async () => {
    const bodyOnly = PEM.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '')
    const repaired = `-----BEGIN PRIVATE KEY-----\n${bodyOnly.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`

    expect(classifyApplePrivateKey(repaired)).toBe('pkcs8')
    await expect(jose.importPKCS8(repaired, 'ES256')).resolves.toBeDefined()
  })

  // macOS rewrites the banner's ASCII hyphens when a .p8 is opened in TextEdit
  // and copied out. The text still reads as a PEM, so this used to fall through
  // to 'unknown' and tell the developer nothing.
  test.each([
    ['em dashes', '—'],
    ['en dashes', '–'],
    ['horizontal bars', '―'],
  ])('flags smart punctuation in the banner (%s)', (_label, dash) => {
    expect(classifyApplePrivateKey(PEM.replace(/-----/g, dash.repeat(2)))).toBe('smart-punctuation')
  })

  test('flags RTF — TextEdit re-saved the .p8', () => {
    expect(classifyApplePrivateKey('{\\rtf1\\ansi\\ansicpg1252 -----BEGIN PRIVATE KEY-----'))
      .toBe('rtf')
  })

  test.each([
    ['an absolute path', '/Users/someone/Downloads/AuthKey_ABC1234567.p8'],
    ['a tilde path', '~/Downloads/AuthKey_ABC1234567.p8'],
  ])('flags %s given instead of the key contents', (_label, value) => {
    expect(classifyApplePrivateKey(value)).toBe('file-path')
  })

  test('treats a UTF-8 BOM before the banner as leading whitespace', () => {
    expect(classifyApplePrivateKey(`﻿${PEM}`)).toBe('leading-whitespace')
  })

  test.each([
    ['an empty string', ''],
    ['undefined', undefined],
    ['null', null],
    ['a number', 42],
  ])('treats %s as empty', (_label, value) => {
    expect(classifyApplePrivateKey(value)).toBe('empty')
  })

  test('falls back to unknown for unrecognisable junk', () => {
    expect(classifyApplePrivateKey('not a key at all')).toBe('unknown')
  })

  test('never echoes key material', () => {
    const body = PEM.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '')
    const sample = body.slice(0, 40)
    for (const value of [PEM, `"${PEM}"`, Buffer.from(PEM).toString('base64')]) {
      expect(classifyApplePrivateKey(value)).not.toContain(sample)
    }
  })
})

describe('explainApplePrivateKeyFormat', () => {
  test.each<ApplePrivateKeyFormat>(['pkcs8', 'pkcs8-escaped-newlines'])(
    'returns no remediation for the usable format %s',
    (format) => {
      expect(explainApplePrivateKeyFormat(format)).toBeNull()
    },
  )

  test.each<ApplePrivateKeyFormat>([
    'empty',
    'quoted',
    'leading-whitespace',
    'sec1',
    'pkcs1',
    'base64-blob',
    'pem-body-only',
    'smart-punctuation',
    'rtf',
    'file-path',
    'unknown',
  ])('returns actionable remediation for %s', (format) => {
    const explanation = explainApplePrivateKeyFormat(format)
    expect(explanation).toBeTruthy()
    expect(explanation!.length).toBeGreaterThan(20)
  })
})

describe('describeApplePrivateKeyValue', () => {
  test('masks key material so the output is safe to paste', () => {
    const forensics = describeApplePrivateKeyValue(PEM)
    const body = PEM.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '')

    expect(forensics.preview).not.toContain(body.slice(0, 20))
    expect(forensics.preview).toContain('base64 chars')
  })

  test('reports the banner even when it does not match byte for byte', () => {
    expect(describeApplePrivateKeyValue(PEM.replace(/-----/g, '——')).mentionsBanner).toBe(true)
  })

  test('distinguishes escaped from real newlines', () => {
    expect(describeApplePrivateKeyValue(PEM).hasRealNewlines).toBe(true)
    expect(describeApplePrivateKeyValue(PEM).hasEscapedNewlines).toBe(false)

    const escaped = describeApplePrivateKeyValue(PEM.replace(/\n/g, '\\n'))
    expect(escaped.hasEscapedNewlines).toBe(true)
    expect(escaped.hasRealNewlines).toBe(false)
  })

  test('surfaces a BOM through the leading code points', () => {
    expect(describeApplePrivateKeyValue(`﻿${PEM}`).firstCodePoints).toMatch(/^U\+FEFF/)
  })

  test('flags carriage returns from a CRLF paste', () => {
    expect(describeApplePrivateKeyValue(PEM.replace(/\n/g, '\r\n')).hasCarriageReturns).toBe(true)
  })

  test('reports a body-only value as having no banner', () => {
    const forensics = describeApplePrivateKeyValue('MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdw')
    expect(forensics.mentionsBanner).toBe(false)
    expect(forensics.hasNonAscii).toBe(false)
  })

  test.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 42],
  ])('does not throw on %s', (_label, value) => {
    expect(() => describeApplePrivateKeyValue(value)).not.toThrow()
    expect(describeApplePrivateKeyValue(value).length).toBe(0)
  })
})
