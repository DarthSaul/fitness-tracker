import { describe, expect, test } from 'vitest'
import { assertLocalTarget, isLocalUrl } from './local-guard'

describe('isLocalUrl', () => {
  test.each([
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    'postgresql://postgres:postgres@localhost:54322/postgres',
    'http://127.0.0.1:54321',
    'http://localhost:54321',
    'postgresql://postgres:postgres@[::1]:54322/postgres',
  ])('accepts %s', (url) => {
    expect(isLocalUrl(url)).toBe(true)
  })

  test.each([
    'postgresql://postgres.abc:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
    'postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres',
    'https://abcdefgh.supabase.co',
    // A hostname that merely starts with "localhost" is not local.
    'postgresql://u:p@localhost.attacker.example:5432/postgres',
    'not a url',
    '',
  ])('rejects %s', (url) => {
    expect(isLocalUrl(url)).toBe(false)
  })
})

describe('assertLocalTarget', () => {
  const local = {
    DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    NUXT_SUPABASE_URL: 'http://127.0.0.1:54321',
  }

  test('passes when both the database and Supabase are local', () => {
    expect(() => assertLocalTarget(local)).not.toThrow()
  })

  test('refuses a remote database', () => {
    expect(() => assertLocalTarget({ ...local, DATABASE_URL: 'postgresql://u:p@db.abc.supabase.co:5432/postgres' }))
      .toThrow(/DATABASE_URL/)
  })

  test('refuses a remote Supabase project', () => {
    expect(() => assertLocalTarget({ ...local, NUXT_SUPABASE_URL: 'https://abc.supabase.co' }))
      .toThrow(/NUXT_SUPABASE_URL/)
  })

  test('refuses when a variable is missing', () => {
    expect(() => assertLocalTarget({ DATABASE_URL: local.DATABASE_URL })).toThrow(/NUXT_SUPABASE_URL/)
  })

  test('never echoes the connection string, which carries a password', () => {
    const remote = 'postgresql://u:s3cret@db.abc.supabase.co:5432/postgres'
    expect(() => assertLocalTarget({ ...local, DATABASE_URL: remote })).toThrow(expect.not.stringContaining('s3cret'))
  })
})
