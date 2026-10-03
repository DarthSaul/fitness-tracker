/**
 * APNs device tokens are hex today, 64 chars (32 bytes). Apple says the
 * length may grow, so allow headroom rather than pinning 64. The token is
 * interpolated into the APNs request path (`/3/device/:token`), so anything
 * that isn't plain hex must never reach the table.
 */
const APNS_DEVICE_TOKEN = /^[0-9a-f]{64,200}$/i

/**
 * The token lowercased, or null if it isn't one. Lowercasing makes it
 * canonical: the column's unique index is case-sensitive, so "ABCD…" and
 * "abcd…" would otherwise be two live rows for one device, pushed twice.
 */
export function parseApnsDeviceToken(value: unknown): string | null {
  return typeof value === 'string' && APNS_DEVICE_TOKEN.test(value) ? value.toLowerCase() : null
}
