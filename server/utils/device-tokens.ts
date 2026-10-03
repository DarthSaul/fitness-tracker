/**
 * APNs device tokens are hex today, 64 chars (32 bytes). Apple says the
 * length may grow, so allow headroom rather than pinning 64. The token is
 * interpolated into the APNs request path (`/3/device/:token`), so anything
 * that isn't plain hex must never reach the table.
 */
const APNS_DEVICE_TOKEN = /^[0-9a-f]{64,200}$/i

export function isApnsDeviceToken(value: unknown): value is string {
  return typeof value === 'string' && APNS_DEVICE_TOKEN.test(value)
}
