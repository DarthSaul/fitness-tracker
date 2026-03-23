import { createClient } from '@supabase/supabase-js'

const supabaseClientSingleton = () => {
  const config = useRuntimeConfig()
  return createClient(config.supabaseUrl, config.supabaseAnonKey)
}

type SupabaseClientSingleton = ReturnType<typeof supabaseClientSingleton>

const globalForSupabase = globalThis as unknown as {
  supabaseGlobal: SupabaseClientSingleton | undefined
}

export const supabase = globalForSupabase.supabaseGlobal ?? supabaseClientSingleton()

if (process.env.NODE_ENV !== 'production') {
  globalForSupabase.supabaseGlobal = supabase
}
