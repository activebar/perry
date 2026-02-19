import { NextRequest, NextResponse } from 'next/server'
import { supabaseServiceRole } from '@/lib/supabase'
import { getAdminFromRequest, requireMaster } from '@/lib/adminSession'

export const dynamic = 'force-dynamic'

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('Unauthorized', 401)
  requireMaster(admin)

  const url = new URL(req.url)
  const access_id = (url.searchParams.get('access_id') || '').trim()
  if (!access_id) return jsonError('Missing access_id')

  const srv = supabaseServiceRole()
  const { data, error } = await srv
    .from('event_access_sessions')
    .select('id,access_id,event_id,device_label,ip,user_agent,created_at,last_seen_at,is_active')
    .eq('access_id', access_id)
    .order('last_seen_at', { ascending: false })
  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ ok: true, rows: data || [] })
}

export async function PATCH(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('Unauthorized', 401)
  requireMaster(admin)

  const body = await req.json().catch(() => ({}))
  const id = String(body.id || '').trim()
  const is_active = !!body.is_active
  if (!id) return jsonError('Missing id')

  const srv = supabaseServiceRole()
  const { error } = await srv.from('event_access_sessions').update({ is_active }).eq('id', id)
  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ ok: true })
}