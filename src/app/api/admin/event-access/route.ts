import { NextRequest, NextResponse } from 'next/server'
import { supabaseServiceRole } from '@/lib/supabase'
import { getAdminFromRequest, requireMaster } from '@/lib/adminSession'
import { generateCode, hashCode, formatCode } from '@/lib/accessCode'
import { sendEmail, appUrl } from '@/lib/mailer'

export const dynamic = 'force-dynamic'

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

type AccessRow = {
  id: string
  event_id: string
  name: string
  role: string
  phone: string | null
  email: string | null
  is_active: boolean
  session_version: number
  last_sent_at: string | null
  created_at: string
}

async function list(event_id: string) {
  const srv = supabaseServiceRole()
  const { data, error } = await srv
    .from('event_access')
    .select('id,event_id,name,role,phone,email,is_active,session_version,last_sent_at,created_at')
    .eq('event_id', event_id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as AccessRow[]
}

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('Unauthorized', 401)
  requireMaster(admin)

  const event_id = (new URL(req.url).searchParams.get('event_id') || '').trim()
  if (!event_id) return jsonError('Missing event_id')

  try {
    const rows = await list(event_id)
    return NextResponse.json({ ok: true, rows })
  } catch (e: any) {
    return jsonError(e?.message || 'Error', 500)
  }
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('Unauthorized', 401)
  requireMaster(admin)

  try {
    const body = await req.json().catch(() => ({}))
    const event_id = String(body.event_id || '').trim()
    const name = String(body.name || '').trim()
    const role = String(body.role || 'client').trim()
    const phone = body.phone ? String(body.phone).trim() : null
    const email = body.email ? String(body.email).trim().toLowerCase() : null
    const send = String(body.send || 'none') as 'none' | 'email' | 'both'

    if (!event_id) return jsonError('Missing event_id')
    if (!name) return jsonError('Missing name')
    if (!email && send !== 'none') return jsonError('Missing email for sending')

    const code = generateCode(10)
    const code_hash = hashCode(code)

    const srv = supabaseServiceRole()
    const { data, error } = await srv
      .from('event_access')
      .insert({ event_id, name, role, phone, email, code_hash, is_active: true })
      .select('id')
      .single()
    if (error) return jsonError(error.message, 500)

    // optionally send email now
    if ((send === 'email' || send === 'both') && email) {
      const url = `${appUrl()}/admin/login?event=${encodeURIComponent(event_id)}`
      const formatted = formatCode(code)
      const html = `
        <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6">
          <h2>פרטי גישה למערכת ניהול האירוע</h2>
          <p><b>אירוע:</b> ${escapeHtml(event_id)}</p>
          <p><b>קישור כניסה:</b> <a href="${url}">${url}</a></p>
          <p><b>קוד גישה:</b> <span style="font-size:18px;letter-spacing:1px">${formatted}</span></p>
          <p style="color:#555">שמרו את הקוד – הוא מאפשר גישה לניהול האירוע.</p>
        </div>
      `
      await sendEmail({ to: email, subject: 'פרטי גישה לניהול האירוע', html })

      await srv.from('event_access').update({ last_sent_at: new Date().toISOString() }).eq('id', data.id)
    }

    const rows = await list(event_id)
    return NextResponse.json({ ok: true, created_id: data.id, code: send === 'none' ? code : undefined, rows })
  } catch (e: any) {
    return jsonError(e?.message || 'Error', 500)
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('Unauthorized', 401)
  requireMaster(admin)

  try {
    const body = await req.json().catch(() => ({}))
    const id = String(body.id || '').trim()
    const event_id = String(body.event_id || '').trim()
    if (!id || !event_id) return jsonError('Missing id/event_id')

    const srv = supabaseServiceRole()

    if (body.action === 'toggle_active') {
      const is_active = !!body.is_active
      const { error } = await srv.from('event_access').update({ is_active }).eq('id', id).eq('event_id', event_id)
      if (error) return jsonError(error.message, 500)
    }

    if (body.action === 'rotate_code') {
      const code = generateCode(10)
      const code_hash = hashCode(code)
      // bump session_version to force logout everywhere
      const { data: cur, error: cerr } = await srv.from('event_access').select('session_version,email').eq('id', id).single()
      if (cerr) return jsonError(cerr.message, 500)
      const nextVer = (cur?.session_version || 0) + 1
      const { error } = await srv
        .from('event_access')
        .update({ code_hash, session_version: nextVer, last_sent_at: new Date().toISOString() })
        .eq('id', id)
        .eq('event_id', event_id)
      if (error) return jsonError(error.message, 500)

      // optional send
      const send = String(body.send || 'none') as 'none' | 'email'
      const email = body.email ? String(body.email).trim().toLowerCase() : (cur?.email || null)
      if (send === 'email' && email) {
        const url = `${appUrl()}/admin/login?event=${encodeURIComponent(event_id)}`
        const formatted = formatCode(code)
        const html = `
          <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6">
            <h2>קוד גישה חדש לניהול האירוע</h2>
            <p><b>אירוע:</b> ${escapeHtml(event_id)}</p>
            <p><b>קישור כניסה:</b> <a href="${url}">${url}</a></p>
            <p><b>קוד גישה חדש:</b> <span style="font-size:18px;letter-spacing:1px">${formatted}</span></p>
          </div>
        `
        await sendEmail({ to: email, subject: 'קוד גישה חדש לניהול האירוע', html })
      }

      const rows = await list(event_id)
      return NextResponse.json({ ok: true, code: send === 'none' ? code : undefined, rows })
    }

    if (body.action === 'logout_all') {
      const { data: cur, error: cerr } = await srv.from('event_access').select('session_version').eq('id', id).single()
      if (cerr) return jsonError(cerr.message, 500)
      const nextVer = (cur?.session_version || 0) + 1
      const { error } = await srv.from('event_access').update({ session_version: nextVer }).eq('id', id).eq('event_id', event_id)
      if (error) return jsonError(error.message, 500)
      const rows = await list(event_id)
      return NextResponse.json({ ok: true, rows })
    }

    return jsonError('Unknown action')
  } catch (e: any) {
    return jsonError(e?.message || 'Error', 500)
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('Unauthorized', 401)
  requireMaster(admin)

  const url = new URL(req.url)
  const id = (url.searchParams.get('id') || '').trim()
  const event_id = (url.searchParams.get('event_id') || '').trim()
  if (!id || !event_id) return jsonError('Missing id/event_id')

  try {
    const srv = supabaseServiceRole()
    const { error } = await srv.from('event_access').delete().eq('id', id).eq('event_id', event_id)
    if (error) return jsonError(error.message, 500)
    const rows = await list(event_id)
    return NextResponse.json({ ok: true, rows })
  } catch (e: any) {
    return jsonError(e?.message || 'Error', 500)
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
