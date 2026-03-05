import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getPublicEnv, getServerEnv } from './env'

function noStoreFetch(input: any, init?: any) {
  // Next.js App Router patches global fetch and may cache requests on the server.
  // We force `cache: 'no-store'` to avoid stale/"wrong event" data on first navigation.
  return fetch(input, { ...(init || {}), cache: 'no-store' })
}

export function supabaseAnon(): SupabaseClient {
  const pub = getPublicEnv()
  return createClient(pub.NEXT_PUBLIC_SUPABASE_URL, pub.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: noStoreFetch }
  })
}

export function supabaseServiceRole(): SupabaseClient {
  const pub = getPublicEnv()
  const srv = getServerEnv()
  return createClient(pub.NEXT_PUBLIC_SUPABASE_URL, srv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: noStoreFetch }
  })
}

export function getPublicUploadUrl(path: string) {
  const pub = getPublicEnv()
  const clean = path.replace(/^\//, '')
  return `${pub.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/uploads/${clean}`
}
