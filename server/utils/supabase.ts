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

export const supabase = globalForSupabase.supabaseGlobal ?? supabaseClientSingleton()

if (process.env.NODE_ENV !== 'production') {
  globalForSupabase.supabaseGlobal = supabase
}
