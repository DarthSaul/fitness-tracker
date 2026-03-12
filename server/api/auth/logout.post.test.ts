/**
 * Tests for server/api/auth/logout.post.ts
 *
 * Coverage strategy:
 *  - Happy path: clearUserSession is called, then redirect to /login
 *  - Ordering: clear happens before redirect
 *  - Error propagation: if clearUserSession throws, the error bubbles
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './logout.post'

const mockClearUserSession = clearUserSession as ReturnType<typeof vi.fn>
const mockSendRedirect = sendRedirect as ReturnType<typeof vi.fn>

function makeEvent() {
  return { path: '/api/auth/logout', context: {} }
}

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockClearUserSession.mockResolvedValue(undefined)
    mockSendRedirect.mockResolvedValue(undefined)
  })

  test('clears the user session', async () => {
    const event = makeEvent()
    await (handler as (e: typeof event) => Promise<void>)(event)
    expect(mockClearUserSession).toHaveBeenCalledOnce()
    expect(mockClearUserSession).toHaveBeenCalledWith(event)
  })

  test('redirects to /login after clearing session', async () => {
    const event = makeEvent()
    await (handler as (e: typeof event) => Promise<void>)(event)
    expect(mockSendRedirect).toHaveBeenCalledOnce()
    expect(mockSendRedirect).toHaveBeenCalledWith(event, '/login')
  })

  test('clears session before redirecting', async () => {
    const callOrder: string[] = []
    mockClearUserSession.mockImplementation(() => {
      callOrder.push('clear')
      return Promise.resolve()
    })
    mockSendRedirect.mockImplementation(() => {
      callOrder.push('redirect')
      return Promise.resolve()
    })

    const event = makeEvent()
    await (handler as (e: typeof event) => Promise<void>)(event)

    expect(callOrder).toEqual(['clear', 'redirect'])
  })

  test('propagates an error if clearUserSession rejects', async () => {
    mockClearUserSession.mockRejectedValueOnce(new Error('session store failure'))
    const event = makeEvent()
    await expect(
      (handler as (e: typeof event) => Promise<void>)(event),
    ).rejects.toThrow('session store failure')
  })
})
