import { NextRequest, NextResponse } from 'next/server'
import { supabaseServiceRole } from '@/lib/supabase'
import { generateCode, hashCode, formatCode } from '@/lib/accessCode'
import { sendEmail, appUrl } from '@/lib/mailer'

export const dynamic = 'force-dynamic'

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const event_id = String(body.event_id || '').trim()
  const emailOrPhone = String(body.value || '').trim().toLowerCase()
  if (!event_id) return jsonError('Missing event_id')
  if (!emailOrPhone) return jsonError('Missing value')

  const srv = supabaseServiceRole()
  const q = srv
    .from('event_access')
    .select('id,event_id,email,phone,session_version,is_active')
    .eq('event_id', event_id)
    .eq('is_active', true)

  const isEmail = emailOrPhone.includes('@')
  const { data, error } = await (isEmail ? q.eq('email', emailOrPhone) : q.eq('phone', emailOrPhone)).maybeSingle()
  if (error) return jsonError(error.message, 500)
  if (!data) return jsonError('Access not found', 404)
  if (!data.email) return jsonError('No email on this access', 400)

  const code = generateCode(10)
  const code_hash = hashCode(code)
  const nextVer = (data.session_version || 0) + 1

  const { error: uerr } = await srv
    .from('event_access')
    .update({ code_hash, session_version: nextVer, last_sent_at: new Date().toISOString() })
    .eq('id', data.id)
    .eq('event_id', event_id)
  if (uerr) return jsonError(uerr.message, 500)

  const url = `${appUrl()}/admin/login?event=${encodeURIComponent(event_id)}`
  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6">
      <h2>שחזור קוד גישה</h2>
      <p><b>אירוע:</b> ${escapeHtml(event_id)}</p>
      <p><b>קישור כניסה:</b> <a href="${url}">${url}</a></p>
      <p><b>קוד גישה חדש:</b> <span style="font-size:18px;letter-spacing:1px">${formatCode(code)}</span></p>
      <p style="color:#555">הקוד הקודם בוטל והוחלף.</p>
    </div>
  `

  try {
    await sendEmail({ to: data.email, subject: 'שחזור קוד גישה לניהול האירוע', html })
  } catch (e: any) {
    return jsonError(e?.message || 'Failed to send email', 500)
  }

  return NextResponse.json({ ok: true })
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
