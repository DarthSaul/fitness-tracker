import { createClient } from '@supabase/supabase-js'

const supabaseClientSingleton = () => {
  const config = useRuntimeConfig()
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error('Missing Supabase runtime config: supabaseUrl or supabaseServiceRoleKey')
  }
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

type SupabaseClientSingleton = ReturnType<typeof supabaseClientSingleton>

const globalForSupabase = globalThis as unknown as {
  supabaseGlobal: SupabaseClientSingleton | undefined
}

/**
 * The shared service-role client, for Storage and `auth.admin`. Never call a
 * session-setting auth method on it (`signInWithPassword`, `signUp`,
 * `setSession`, `updateUser`): `persistSession: false` only stops the session
 * being persisted. supabase-js still holds it in memory and sends that user's
 * token on every later request, so the whole warm instance would act as them.
 * Use {@link createSessionClient} for those calls.
 */
export const supabase = globalForSupabase.supabaseGlobal ?? supabaseClientSingleton()

if (process.env.NODE_ENV !== 'production') {
  globalForSupabase.supabaseGlobal = supabase
}

/**
 * A throwaway client for one request's user-session auth calls, so the
 * session it acquires dies with the request instead of leaking onto the
 * shared {@link supabase} client (DR-DUMBBELL-NUXT-7).
 */
export function createSessionClient(): SupabaseClientSingleton {
  return supabaseClientSingleton()
}
