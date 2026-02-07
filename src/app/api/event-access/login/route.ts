import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServiceRole } from '@/lib/supabase'
import { hashCode, normalizeCode } from '@/lib/accessCode'
import { EVENT_ACCESS_COOKIE, signEventAccess } from '@/lib/eventAccessSession'

export const dynamic = 'force-dynamic'

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

function deviceLabel(ua: string) {
  const u = (ua || '').toLowerCase()
  if (u.includes('iphone')) return 'iPhone'
  if (u.includes('ipad')) return 'iPad'
  if (u.includes('android')) return 'Android'
  if (u.includes('mac')) return 'Mac'
  if (u.includes('windows')) return 'Windows'
  return 'Device'
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const event_id = String(body.event_id || '').trim()
  const code = normalizeCode(String(body.code || ''))
  if (!event_id) return jsonError('Missing event_id')
  if (!code) return jsonError('Missing code')

  const srv = supabaseServiceRole()
  const code_hash = hashCode(code)

  const { data, error } = await srv
    .from('event_access')
    .select('id,event_id,is_active,session_version')
    .eq('event_id', event_id)
    .eq('code_hash', code_hash)
    .maybeSingle()

  if (error) return jsonError(error.message, 500)
  if (!data) return jsonError('Invalid code', 401)
  if (!data.is_active) return jsonError('Access inactive', 403)

  // session record
  const ua = req.headers.get('user-agent') || ''
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || ''
  await srv.from('event_access_sessions').insert({
    access_id: data.id,
    event_id: data.event_id,
    device_label: deviceLabel(ua),
    ip: String(ip).split(',')[0].trim() || null,
    user_agent: ua,
    is_active: true
  })

  const token = signEventAccess({
    access_id: data.id,
    event_id: data.event_id,
    session_version: data.session_version || 1
  })

  cookies().set({
    name: EVENT_ACCESS_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  })

  return NextResponse.json({ ok: true })
}
