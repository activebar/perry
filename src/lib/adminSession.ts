import { NextRequest } from 'next/server'
import { supabaseAnon, supabaseServiceRole } from './supabase'
import { getEventAccessFromRequest } from './eventAccessSession'

export const ADMIN_TOKEN_COOKIE = 'sb_admin_token'

export type AdminRole = 'master' | 'client'

export type AdminRow = {
  id: string
  username: string
  email: string
  role: AdminRole
  is_active: boolean
  // when logged in via event access code
  event_id?: string
  access_id?: string
}

export async function getAdminFromRequest(req: NextRequest): Promise<AdminRow | null> {
  const token = req.cookies.get(ADMIN_TOKEN_COOKIE)?.value
  if (!token) {
    // fallback: event-access session
    const ev = await getEventAccessFromRequest(req)
    if (!ev) return null
    return {
      id: ev.access_id,
      username: ev.name,
      email: ev.email || '',
      role: 'client',
      is_active: true,
      event_id: ev.event_id,
      access_id: ev.access_id,
      permissions: (ev as any).permissions || {}
    }
  }

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

export function requirePermission(admin: AdminRow, perm: string) {
  if (admin.role === 'master') return
  const allowed = !!admin.permissions?.[perm]
  if (!allowed) {
    const e = new Error('Forbidden')
    ;(e as any).status = 403
    throw e
  }
}
