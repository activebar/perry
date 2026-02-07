import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type PermissionMap = Record<string, boolean>

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('Unauthorized', 401)
  if (admin.role !== 'master') return jsonError('Forbidden', 403)

  const { searchParams } = new URL(req.url)
  const event_id = (searchParams.get('event_id') || '').trim()
  if (!event_id) return jsonError('Missing event_id')

  const supabase = supabaseServiceRole()
  const { data, error } = await supabase
    .from('event_admins')
    .select('event_id, admin_user_id, permissions, is_active, created_at, admin_users!inner(id,email,username,role,is_active)')
    .eq('event_id', event_id)
    .order('created_at', { ascending: false })

  if (error) return jsonError(error.message, 500)

  // normalize
  const rows = (data || []).map((r: any) => ({
    event_id: r.event_id,
    admin_user_id: r.admin_user_id,
    permissions: (r.permissions || {}) as PermissionMap,
    is_active: !!r.is_active,
    created_at: r.created_at,
    admin: r.admin_users
  }))

  return NextResponse.json({ ok: true, rows })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('Unauthorized', 401)
  if (admin.role !== 'master') return jsonError('Forbidden', 403)

  const body = await req.json().catch(() => null) as
    | { event_id?: string; email?: string; permissions?: PermissionMap; is_active?: boolean }
    | null

  if (!body) return jsonError('Invalid JSON')
  const event_id = (body.event_id || '').trim()
  const email = (body.email || '').trim().toLowerCase()
  const permissions = (body.permissions || {}) as PermissionMap
  const is_active = body.is_active ?? true

  if (!event_id) return jsonError('Missing event_id')
  if (!email) return jsonError('Missing email')

  const supabase = supabaseServiceRole()

  // Find admin user by email
  const find = await supabase.from('admin_users').select('id,email,is_active').eq('email', email).maybeSingle()
  if (find.error) return jsonError(find.error.message, 500)
  if (!find.data) return jsonError('Admin user not found')
  if (!find.data.is_active) return jsonError('Admin user is inactive')

  const admin_user_id = find.data.id

  const up = await supabase
    .from('event_admins')
    .upsert(
      { event_id, admin_user_id, permissions, is_active },
      { onConflict: 'event_id,admin_user_id' }
    )
    .select('event_id, admin_user_id, permissions, is_active, created_at')
    .single()

  if (up.error) return jsonError(up.error.message, 500)

  return NextResponse.json({ ok: true, row: up.data })
}

export async function PATCH(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('Unauthorized', 401)
  if (admin.role !== 'master') return jsonError('Forbidden', 403)

  const body = await req.json().catch(() => null) as
    | { event_id?: string; admin_user_id?: string; permissions?: PermissionMap; is_active?: boolean }
    | null

  if (!body) return jsonError('Invalid JSON')
  const event_id = (body.event_id || '').trim()
  const admin_user_id = (body.admin_user_id || '').trim()
  const permissions = (body.permissions || {}) as PermissionMap
  const is_active = body.is_active

  if (!event_id) return jsonError('Missing event_id')
  if (!admin_user_id) return jsonError('Missing admin_user_id')

  const supabase = supabaseServiceRole()
  const upd = await supabase
    .from('event_admins')
    .update({
      permissions,
      ...(typeof is_active === 'boolean' ? { is_active } : {})
    })
    .eq('event_id', event_id)
    .eq('admin_user_id', admin_user_id)
    .select('event_id, admin_user_id, permissions, is_active, created_at')
    .single()

  if (upd.error) return jsonError(upd.error.message, 500)
  return NextResponse.json({ ok: true, row: upd.data })
}

export async function DELETE(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('Unauthorized', 401)
  if (admin.role !== 'master') return jsonError('Forbidden', 403)

  const { searchParams } = new URL(req.url)
  const event_id = (searchParams.get('event_id') || '').trim()
  const admin_user_id = (searchParams.get('admin_user_id') || '').trim()

  if (!event_id) return jsonError('Missing event_id')
  if (!admin_user_id) return jsonError('Missing admin_user_id')

  const supabase = supabaseServiceRole()
  const del = await supabase
    .from('event_admins')
    .delete()
    .eq('event_id', event_id)
    .eq('admin_user_id', admin_user_id)

  if (del.error) return jsonError(del.error.message, 500)
  return NextResponse.json({ ok: true })
}
