import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getPublicEnv, getServerEnv } from './env'

export function supabaseAnon(): SupabaseClient {
  const pub = getPublicEnv()
  return createClient(pub.NEXT_PUBLIC_SUPABASE_URL, pub.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

export function supabaseServiceRole(): SupabaseClient {
  const pub = getPublicEnv()
  const srv = getServerEnv()
  const key = srv.SUPABASE_SERVICE_ROLE_KEY || pub.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return createClient(pub.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

export function getPublicUploadUrl(path: string) {
  const pub = getPublicEnv()
  const clean = path.replace(/^\//, '')
  return `${pub.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/uploads/${clean}`
}
