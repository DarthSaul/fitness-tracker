/**
 * Tests for server/api/auth/logout.post.ts
 *
 * Coverage strategy:
 *  - Happy path: clearUserSession is called, then redirect to /login
 *  - Ordering: clear happens before redirect
 *  - Error propagation: if clearUserSession throws, the error bubbles
 *  - Device token: an explicit sign-out revokes the device's push token,
 *    best-effort, so a signed-out phone stops receiving the user's pushes
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

import handler from './logout.post'

const mockClearUserSession = clearUserSession as ReturnType<typeof vi.fn>
const mockSendRedirect = sendRedirect as ReturnType<typeof vi.fn>
const mockGetHeader = getHeader as ReturnType<typeof vi.fn>
const mockReadBody = readBody as ReturnType<typeof vi.fn>
const mockRefreshTokenUpdateMany = (prisma as any).refreshToken.updateMany as ReturnType<typeof vi.fn>
const mockDeviceTokenUpdateMany = (prisma as any).deviceToken.updateMany as ReturnType<typeof vi.fn>

const DEVICE_TOKEN = 'a1b2c3d4'.repeat(8)

function makeEvent() {
  return { path: '/api/auth/logout', context: {} }
}

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockClearUserSession.mockResolvedValue(undefined)
    mockSendRedirect.mockResolvedValue(undefined)
    mockReadBody.mockResolvedValue(null)
    mockRefreshTokenUpdateMany.mockResolvedValue({ count: 0 })
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
    expect(mockSendRedirect).not.toHaveBeenCalled()
  })

  test('revokes refresh token and returns success when refreshToken present without native header', async () => {
    mockReadBody.mockResolvedValueOnce({ refreshToken: 'raw-refresh-token' })
    mockRefreshTokenUpdateMany.mockResolvedValueOnce({ count: 1 })
    const event = makeEvent()
    const result = await (handler as (e: typeof event) => Promise<unknown>)(event)
    expect(mockRefreshTokenUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revokedAt: null }),
        data: { revokedAt: expect.any(Date) },
      }),
    )
    expect(result).toEqual({ success: true })
    expect(mockClearUserSession).not.toHaveBeenCalled()
    expect(mockSendRedirect).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/logout — native client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetHeader.mockImplementation((_event: unknown, header: string) =>
      header === 'x-client-type' ? 'native' : null,
    )
    mockRefreshTokenUpdateMany.mockResolvedValue({ count: 1 })
  })

  test('returns { success: true } for native clients', async () => {
    mockReadBody.mockResolvedValueOnce({})
    const result = await (handler as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent())
    expect(result).toEqual({ success: true })
  })

  test('does not call clearUserSession or sendRedirect for native clients', async () => {
    mockReadBody.mockResolvedValueOnce({})
    await (handler as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent())
    expect(mockClearUserSession).not.toHaveBeenCalled()
    expect(mockSendRedirect).not.toHaveBeenCalled()
  })

  test('revokes the refresh token when provided', async () => {
    mockReadBody.mockResolvedValueOnce({ refreshToken: 'raw-refresh-token' })
    await (handler as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent())
    expect(mockRefreshTokenUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revokedAt: null }),
        data: { revokedAt: expect.any(Date) },
      }),
    )
  })

  test('returns success even when refreshToken is not provided', async () => {
    mockReadBody.mockResolvedValueOnce(null)
    const result = await (handler as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent())
    expect(result).toEqual({ success: true })
    expect(mockRefreshTokenUpdateMany).not.toHaveBeenCalled()
  })

  test('returns success even when token hash is not found (no token leak)', async () => {
    mockReadBody.mockResolvedValueOnce({ refreshToken: 'unknown-token' })
    mockRefreshTokenUpdateMany.mockResolvedValueOnce({ count: 0 })
    const result = await (handler as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent())
    expect(result).toEqual({ success: true })
  })
})

describe('POST /api/auth/logout — device token', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetHeader.mockImplementation((_event: unknown, header: string) =>
      header === 'x-client-type' ? 'native' : null,
    )
    mockRefreshTokenUpdateMany.mockResolvedValue({ count: 1 })
    mockDeviceTokenUpdateMany.mockResolvedValue({ count: 1 })
  })

  test('revokes the live device token when provided', async () => {
    mockReadBody.mockResolvedValueOnce({ refreshToken: 'raw-refresh-token', deviceToken: DEVICE_TOKEN })
    const result = await (handler as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent())
    expect(mockDeviceTokenUpdateMany).toHaveBeenCalledWith({
      where: { token: DEVICE_TOKEN, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    })
    expect(mockRefreshTokenUpdateMany).toHaveBeenCalled()
    expect(result).toEqual({ success: true })
  })

  test('does not touch device tokens when none is provided', async () => {
    mockReadBody.mockResolvedValueOnce({ refreshToken: 'raw-refresh-token' })
    await (handler as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent())
    expect(mockDeviceTokenUpdateMany).not.toHaveBeenCalled()
  })

  test('ignores a malformed device token rather than failing sign-out', async () => {
    mockReadBody.mockResolvedValueOnce({ deviceToken: 'not/a/token' })
    const result = await (handler as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent())
    expect(mockDeviceTokenUpdateMany).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true })
  })

  test('returns success even when the device revoke fails', async () => {
    mockReadBody.mockResolvedValueOnce({ deviceToken: DEVICE_TOKEN })
    mockDeviceTokenUpdateMany.mockRejectedValueOnce(new Error('DB connection lost'))
    const result = await (handler as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent())
    expect(result).toEqual({ success: true })
  })

  test('a deviceToken in the body alone selects the native (JSON) path', async () => {
    mockGetHeader.mockReturnValue(null)
    mockReadBody.mockResolvedValueOnce({ deviceToken: DEVICE_TOKEN })
    const result = await (handler as (e: ReturnType<typeof makeEvent>) => Promise<unknown>)(makeEvent())
    expect(result).toEqual({ success: true })
    expect(mockClearUserSession).not.toHaveBeenCalled()
  })
})
