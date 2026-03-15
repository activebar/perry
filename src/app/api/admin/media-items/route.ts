import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'
import { getEventIdFromRequest } from '@/lib/event-id'

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('unauthorized', 401)
  const canRead = admin.role === 'master' || ['galleries.read', 'galleries.manage', 'site.manage'].some((p) => !!(admin as any).permissions?.[p])
  if (!canRead) return jsonError('forbidden', 403)

  const sp = req.nextUrl.searchParams
  const status = (sp.get('status') || 'pending').toLowerCase()
  const gallery_id = sp.get('gallery_id') || ''

  const sb = supabaseServiceRole()
  let q = sb
    .from('media_items')
    .select('id, url, thumb_url, kind, gallery_id, is_approved, editable_until, storage_path, created_at, uploader_device_id, crop_position, crop_focus_x, crop_focus_y')
    .eq('event_id', (admin as any).event_id || getEventIdFromRequest(req))
    .in('kind', ['gallery', 'galleries', 'gallery_video'])
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
  const canManage = admin.role === 'master' || ['galleries.manage', 'site.manage'].some((p) => !!(admin as any)?.permissions?.[p])
  if (!canManage) return jsonError('forbidden', 403)

  const body = await req.json().catch(() => ({}))
  const id = String(body.id || '').trim()
  if (!id) return jsonError('missing id', 400)

  const patch: Record<string, any> = {}
  if ('is_approved' in body) patch.is_approved = body.is_approved === true
  if ('crop_position' in body) patch.crop_position = body.crop_position
  if ('crop_focus_x' in body) patch.crop_focus_x = body.crop_focus_x
  if ('crop_focus_y' in body) patch.crop_focus_y = body.crop_focus_y

  const sb = supabaseServiceRole()
  const { data, error } = await sb
    .from('media_items')
    .update(patch)
    .eq('event_id', (admin as any).event_id || getEventIdFromRequest(req))
    .eq('id', id)
    .select('*')
    .single()
  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ ok: true, item: data })
}

export async function DELETE(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('unauthorized', 401)
  const canManage = admin.role === 'master' || ['galleries.manage', 'site.manage'].some((p) => !!(admin as any)?.permissions?.[p])
  if (!canManage) return jsonError('forbidden', 403)

  const body = await req.json().catch(() => ({}))
  const id = String(body.id || '').trim()
  if (!id) return jsonError('missing id', 400)

  const sb = supabaseServiceRole()
  const { data: row, error: rerr } = await sb
    .from('media_items')
    .select('id, storage_path, url, thumb_url')
    .eq('event_id', (admin as any).event_id || getEventIdFromRequest(req))
    .eq('id', id)
    .single()
  if (rerr) return jsonError(rerr.message, 500)

  const path = (row as any)?.storage_path
  const url = (row as any)?.url
  const thumbUrl = (row as any)?.thumb_url
  const derivePath = (u: any): string | null => {
    if (typeof u !== 'string') return null
    const m = u.match(/\/storage\/v1\/object\/public\/uploads\/(.+)$/)
    return m?.[1] ? String(m[1]) : null
  }
  const thumbCandidates = (basePath: string): string[] => {
    const out = new Set<string>()
    out.add(`${basePath}.thumb.webp`)
    const stripped = basePath.replace(/\.[^./]+$/, '')
    if (stripped && stripped !== basePath) out.add(`${stripped}.thumb.webp`)
    return Array.from(out)
  }
  const base = (typeof path === 'string' && path.trim()) ? path.trim() : (derivePath(url) || derivePath(thumbUrl))
  if (base) {
    const paths: string[] = [base]
    if (!base.endsWith('.thumb.webp')) paths.push(...thumbCandidates(base))
    else paths.push(base.replace(/\.thumb\.webp$/, ''))
    await sb.storage.from('uploads').remove(Array.from(new Set(paths))).catch(() => null as any)
  }

  const { error: derr } = await sb.from('media_items').delete().eq('event_id', (admin as any).event_id || getEventIdFromRequest(req)).eq('id', id)
  if (derr) return jsonError(derr.message, 500)
  return NextResponse.json({ ok: true })
}
