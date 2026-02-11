import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest, requireAnyPermission } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'
import { getEventId } from '@/lib/event-id'

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('unauthorized', 401)

  // allow master or anyone with galleries permissions
  try {
    requireAnyPermission(admin, ['galleries.read', 'galleries.manage', 'site.manage'])
  } catch {
    return jsonError('forbidden', 403)
  }

  const eventId = admin.event_id || getEventId()

  const sb = supabaseServiceRole()

  // Enforce: galleries that are not referenced by `blocks` are treated as "not existing".
  // We list only galleries referenced by visible gallery blocks (gallery_1/2/3...).
  const { data: gBlocks } = await sb
    .from('blocks')
    .select('id, type, config, order_index, is_visible')
    .eq('event_id', eventId)
    .eq('is_visible', true)
    .order('order_index', { ascending: true })

  const galleryIds = (gBlocks || [])
    .filter((b: any) => String(b.type || '').startsWith('gallery_'))
    .map((b: any) => String((b.config || {}).gallery_id || (b.config || {}).galleryId || ''))
    .filter(Boolean)

  if (galleryIds.length === 0) {
    return NextResponse.json({ ok: true, galleries: [] })
  }

  const { data, error } = await sb
    .from('galleries')
    .select('*')
    .eq('event_id', eventId)
    .in('id', galleryIds)
    .order('order_index', { ascending: true })
  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ ok: true, galleries: data || [] })
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('unauthorized', 401)
  try {
    requireAnyPermission(admin, ['galleries.manage', 'site.manage'])
  } catch {
    return jsonError('forbidden', 403)
  }

  const body = await req.json().catch(() => ({}))
  const id = String(body.id || '').trim()
  if (!id) return jsonError('missing id', 400)

  const patch: any = {}
  if (body.title !== undefined) patch.title = body.title
  if (body.upload_enabled !== undefined) patch.upload_enabled = !!body.upload_enabled
  if (body.require_approval !== undefined) patch.require_approval = !!body.require_approval
  if (body.auto_approve_until !== undefined) patch.auto_approve_until = body.auto_approve_until
  if (body.upload_default_hours !== undefined) patch.upload_default_hours = Number(body.upload_default_hours) || 8

  const sb = supabaseServiceRole()
  const eventId = admin.event_id || getEventId()
  const { data, error } = await sb
    .from('galleries')
    .update(patch)
    .eq('id', id)
    .eq('event_id', eventId)
    .select('*')
    .single()
  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ ok: true, gallery: data })
}

export async function POST(req: NextRequest) {
  // "Open for limited time" => sets auto_approve_until and (by design) enables uploads.
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('unauthorized', 401)
  try {
    requireAnyPermission(admin, ['galleries.manage', 'site.manage'])
  } catch {
    return jsonError('forbidden', 403)
  }

  const body = await req.json().catch(() => ({}))
  const id = String(body.id || '').trim()
  const hours = Number(body.hours || 8)

  if (!id) return jsonError('missing id', 400)
  const safeHours = Number.isFinite(hours) && hours > 0 ? Math.min(hours, 72) : 8
  const until = new Date(Date.now() + safeHours * 60 * 60 * 1000).toISOString()

  const sb = supabaseServiceRole()
  const eventId = admin.event_id || getEventId()
  const { data, error } = await sb
    .from('galleries')
    .update({ upload_enabled: true, auto_approve_until: until })
    .eq('id', id)
    .eq('event_id', eventId)
    .select('*')
    .single()

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ ok: true, gallery: data })
}
