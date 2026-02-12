import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('unauthorized', 401)
  // NOTE: requireAnyPermission() throws on forbidden (returns void), so we use a boolean check here.
  const canRead =
    admin.role === 'master' ||
    ['galleries.read', 'galleries.manage', 'site.manage'].some((p) => !!(admin as any).permissions?.[p])
  if (!canRead) return jsonError('forbidden', 403)

  const sp = req.nextUrl.searchParams
  const status = (sp.get('status') || 'pending').toLowerCase()
  const gallery_id = sp.get('gallery_id') || ''

  const sb = supabaseServiceRole()
  let q = sb
    .from('media_items')
    .select('id, url, thumb_url, kind, gallery_id, is_approved, editable_until, storage_path, created_at, uploader_device_id')
    .eq('event_id', admin.event_id)
    .eq('kind', 'gallery')
    .order('created_at', { ascending: false })

  if (gallery_id) q = q.eq('gallery_id', gallery_id)

  if (status === 'pending') q = q.eq('is_approved', false)
  if (status === 'approved') q = q.eq('is_approved', true)

  const { data, error } = await q
  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ ok: true, items: data || [] })
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('unauthorized', 401)
  const canManage =
    admin.role === 'master' ||
    ['galleries.manage', 'site.manage'].some((p) => !!(admin as any)?.permissions?.[p])
  if (!canManage) return jsonError('forbidden', 403)

  const body = await req.json().catch(() => ({}))
  const id = String(body.id || '').trim()
  const is_approved = body.is_approved === true

  if (!id) return jsonError('missing id', 400)

  const sb = supabaseServiceRole()
  const { data, error } = await sb
    .from('media_items')
    .update({ is_approved })
    .eq('event_id', admin.event_id)
    .eq('id', id)
    .select('*')
    .single()
  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ ok: true, item: data })
}

export async function DELETE(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('unauthorized', 401)
  const canManage =
    admin.role === 'master' ||
    ['galleries.manage', 'site.manage'].some((p) => !!(admin as any)?.permissions?.[p])
  if (!canManage) return jsonError('forbidden', 403)

  const body = await req.json().catch(() => ({}))
  const id = String(body.id || '').trim()
  if (!id) return jsonError('missing id', 400)

  const sb = supabaseServiceRole()
  const { data: row, error: rerr } = await sb
    .from('media_items')
    .select('id, storage_path')
    .eq('event_id', admin.event_id)
    .eq('id', id)
    .single()
  if (rerr) return jsonError(rerr.message, 500)

  // delete storage file first (best-effort)
  const path = (row as any)?.storage_path
  if (path) {
    await sb.storage.from('uploads').remove([path]).catch(() => null as any)
  }

  const { error } = await sb.from('media_items')
  const { error: derr } = await sb
    .from('media_items')
    .delete()
    .eq('event_id', admin.event_id)
    .eq('id', id)
  if (error) return jsonError(error.message, 500)

  return NextResponse.json({ ok: true })
}