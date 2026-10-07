/**
 * Tests for server/utils/supabase.ts
 *
 * vitest.setup.ts stubs a global `supabase` for route tests; this file imports
 * the real module with `createClient` mocked. The module builds its client at
 * import time, so each test resets modules and re-imports under the config and
 * NODE_ENV it cares about.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

const mockCreateClient = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}))

const mockUseRuntimeConfig = useRuntimeConfig as unknown as ReturnType<typeof vi.fn>
const globalForSupabase = globalThis as unknown as { supabaseGlobal?: unknown }

const validConfig = {
  supabaseUrl: 'https://test.supabase.co',
  supabaseServiceRoleKey: 'test-service-role-key',
}

describe('supabase client', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalConfig = mockUseRuntimeConfig.getMockImplementation()

  beforeEach(() => {
    vi.resetModules()
    mockCreateClient.mockReset()
    mockCreateClient.mockReturnValue({ id: 'client-1' })
    mockUseRuntimeConfig.mockReturnValue(validConfig)
    delete globalForSupabase.supabaseGlobal
  })

  afterEach(() => {
    vi.stubEnv('NODE_ENV', originalNodeEnv ?? 'test')
    delete globalForSupabase.supabaseGlobal
    if (originalConfig) mockUseRuntimeConfig.mockImplementation(originalConfig)
  })

  test('creates a service-role client that neither refreshes nor persists sessions', async () => {
    const { supabase } = await import('./supabase')

    expect(mockCreateClient).toHaveBeenCalledTimes(1)
    expect(mockCreateClient).toHaveBeenCalledWith('https://test.supabase.co', 'test-service-role-key', {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    expect(supabase).toEqual({ id: 'client-1' })
  })

  test('throws when the Supabase URL is missing', async () => {
    mockUseRuntimeConfig.mockReturnValue({ ...validConfig, supabaseUrl: '' })

    await expect(import('./supabase')).rejects.toThrow('Missing Supabase runtime config')
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  test('throws when the service role key is missing', async () => {
    mockUseRuntimeConfig.mockReturnValue({ ...validConfig, supabaseServiceRoleKey: undefined })

    await expect(import('./supabase')).rejects.toThrow('Missing Supabase runtime config')
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  test('caches the client on globalThis outside production so reloads reuse it', async () => {
    vi.stubEnv('NODE_ENV', 'development')

    const first = await import('./supabase')
    expect(globalForSupabase.supabaseGlobal).toBe(first.supabase)

    vi.resetModules()
    const second = await import('./supabase')

    expect(second.supabase).toBe(first.supabase)
    expect(mockCreateClient).toHaveBeenCalledTimes(1)
  })

  test('does not cache the client on globalThis in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    await import('./supabase')

    expect(globalForSupabase.supabaseGlobal).toBeUndefined()
  })
})
