import { describe, test, expect } from 'vitest'

import { parseReportInput, REPORT_REASONS, REPORT_DETAILS_MAX } from './reports'

describe('parseReportInput', () => {
  test('a post report, details trimmed', () => {
    expect(parseReportInput({ postId: ' p1 ', reason: 'SPAM', details: '  buy now  ' }, 'me'))
      .toEqual({ target: { kind: 'post', postId: 'p1' }, reason: 'SPAM', details: 'buy now' })
  })

  test('a user report, no details', () => {
    expect(parseReportInput({ userId: 'u1', reason: 'IMPERSONATION' }, 'me'))
      .toEqual({ target: { kind: 'user', userId: 'u1' }, reason: 'IMPERSONATION', details: null })
  })

  test('blank details become null', () => {
    expect(parseReportInput({ userId: 'u1', reason: 'OTHER', details: '   ' }, 'me').details).toBeNull()
  })

  test('details at the limit are accepted', () => {
    const details = 'x'.repeat(REPORT_DETAILS_MAX)
    expect(parseReportInput({ postId: 'p1', reason: 'OTHER', details }, 'me').details).toBe(details)
  })

  test('every listed reason is accepted', () => {
    expect(REPORT_REASONS).toEqual(['SPAM', 'HARASSMENT', 'HATE', 'SEXUAL_CONTENT', 'VIOLENCE', 'SELF_HARM', 'IMPERSONATION', 'OTHER'])
    for (const reason of REPORT_REASONS) {
      expect(parseReportInput({ userId: 'u1', reason }, 'me').reason).toBe(reason)
    }
  })

  test.each([
    ['no target', { reason: 'SPAM' }],
    ['both targets', { postId: 'p1', userId: 'u1', reason: 'SPAM' }],
    ['a blank postId', { postId: '  ', reason: 'SPAM' }],
    ['a non-string userId', { userId: 7, reason: 'SPAM' }],
    ['a null postId', { postId: null, reason: 'SPAM' }],
    ['no reason', { userId: 'u1' }],
    ['an unknown reason', { userId: 'u1', reason: 'RUDE' }],
    ['a lowercase reason', { userId: 'u1', reason: 'spam' }],
    ['details over the limit', { userId: 'u1', reason: 'OTHER', details: 'x'.repeat(REPORT_DETAILS_MAX + 1) }],
    ['non-string details', { userId: 'u1', reason: 'OTHER', details: 5 }],
    ['reporting yourself', { userId: 'me', reason: 'SPAM' }],
    ['no body at all', undefined],
  ])('400 for %s', (_label, input) => {
    expect(() => parseReportInput(input, 'me')).toThrow(expect.objectContaining({ statusCode: 400 }))
  })
})
