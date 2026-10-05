// Dev scripts that write fake accounts must never reach the hosted database,
// which production shares (docs/LOCAL_DEV.md). They call assertLocalTarget
// before touching Prisma or Supabase.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** True only when the URL parses and its host is this machine. */
export function isLocalUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname)
  } catch {
    return false
  }
}

/**
 * Throws unless both the database and the Supabase project are local. The
 * message names the variable only, never its value: a connection string
 * carries a password.
 */
export function assertLocalTarget(env: Record<string, string | undefined>): void {
  for (const name of ['DATABASE_URL', 'NUXT_SUPABASE_URL']) {
    if (!isLocalUrl(env[name] ?? '')) {
      throw new Error(
        `Refusing to run: ${name} is not a local address. This script writes fake accounts `
        + 'and must only run against the local Supabase stack. Use the .env.dev file (docs/LOCAL_DEV.md).',
      )
    }
  }
}
