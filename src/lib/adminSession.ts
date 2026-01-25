import { NextRequest } from 'next/server'
import { supabaseAnon, supabaseServiceRole } from './supabase'

export const ADMIN_TOKEN_COOKIE = 'sb_admin_token'

export type AdminRole = 'master' | 'client'

export type AdminRow = {
  id: string
  username: string
  email: string
  role: AdminRole
  is_active: boolean
}

export async function getAdminFromRequest(req: NextRequest): Promise<AdminRow | null> {
  const token = req.cookies.get(ADMIN_TOKEN_COOKIE)?.value
  if (!token) return null

  const sb = supabaseAnon()
  const { data: userRes, error: userErr } = await sb.auth.getUser(token)
  if (userErr || !userRes.user?.email) return null

  const srv = supabaseServiceRole()
  const { data, error } = await srv
    .from('admin_users')
    .select('*')
    .eq('email', userRes.user.email)
    .eq('is_active', true)
    .limit(1)
    .single()
  if (error) return null
  return data as any
}

export function requireMaster(admin: AdminRow) {
  if (admin.role !== 'master') {
    const e = new Error('Forbidden')
    ;(e as any).status = 403
    throw e
  }
}
