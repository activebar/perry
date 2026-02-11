import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { supabaseServiceRole } from './supabase'

export const EVENT_ACCESS_COOKIE = 'ab_event_access'

type CookiePayload = {
  access_id: string
  event_id: string
  session_version: number
  iat: number
}

export type EventAccessRow = {
  id: string
  event_id: string
  name: string
  role: string
  phone: string | null
  email: string | null
  is_active: boolean
  session_version: number
  permissions?: Record<string, boolean> | null
}

function secret() {
  return (process.env.EVENT_ACCESS_SECRET || '').trim() || 'dev-insecure-secret'
}

function b64url(buf: Buffer) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function unb64url(s: string) {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return Buffer.from(s, 'base64')
}

export function signEventAccess(payload: Omit<CookiePayload, 'iat'>) {
  const p: CookiePayload = { ...payload, iat: Date.now() }
  const data = Buffer.from(JSON.stringify(p), 'utf8')
  const sig = crypto.createHmac('sha256', secret()).update(data).digest()
  return `${b64url(data)}.${b64url(sig)}`
}

export function verifyEventAccess(token: string): CookiePayload | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  try {
    const data = unb64url(parts[0])
    const sig = unb64url(parts[1])
    const exp = crypto.createHmac('sha256', secret()).update(data).digest()
    if (!crypto.timingSafeEqual(sig, exp)) return null
    const p = JSON.parse(data.toString('utf8')) as CookiePayload
    if (!p?.access_id || !p?.event_id) return null
    return p
  } catch {
    return null
  }
}

export async function getEventAccessFromRequest(req: NextRequest) {
  const token = req.cookies.get(EVENT_ACCESS_COOKIE)?.value
  if (!token) return null
  const payload = verifyEventAccess(token)
  if (!payload) return null

  const srv = supabaseServiceRole()
  const { data, error } = await srv
    .from('event_access')
    .select('id,event_id,name,role,phone,email,is_active,session_version,permissions')
    .eq('id', payload.access_id)
    .eq('event_id', payload.event_id)
    .maybeSingle()
  if (error || !data) return null
  if (!data.is_active) return null
  if ((data.session_version ?? 0) !== payload.session_version) return null
  return {
    access_id: data.id,
    event_id: data.event_id,
    name: data.name,
    role: data.role,
    phone: data.phone,
    email: data.email,
    is_active: data.is_active,
    session_version: data.session_version,
    permissions: (data as any).permissions || {}
  }
}
