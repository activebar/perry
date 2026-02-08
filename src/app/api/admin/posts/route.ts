import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest, requirePermission } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'

const ALLOWED_KINDS = new Set(['blessing', 'gallery'])
const ALLOWED_STATUS = new Set(['pending', 'approved', 'deleted'])

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const kind = (req.nextUrl.searchParams.get('kind') || '').trim()
  // permission gate
  if (admin.role !== 'master') {
    if (kind === 'gallery') {
      requirePermission(admin, 'galleries.read')
    } else {
      // default blessing
      requirePermission(admin, 'blessings.read')
    }
  }
  const status = (req.nextUrl.searchParams.get('status') || '').trim()

  const srv = supabaseServiceRole()
  let q = srv.from('posts').select('*').order('created_at', { ascending: false }).limit(500)

  // Scope event-access (code login) to its event
  if (admin.event_id) q = q.eq('event_id', admin.event_id)

  if (kind && ALLOWED_KINDS.has(kind)) q = q.eq('kind', kind)
  if (status && ALLOWED_STATUS.has(status)) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, posts: data || [] })
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

    // allow: status update + editing fields for content moderation
    const patch: any = {}
    if (typeof body.status === 'string' && ALLOWED_STATUS.has(body.status)) patch.status = body.status

    const editableFields = ['author_name', 'text', 'link_url', 'media_url', 'media_path', 'video_url']
    const willEditFields = editableFields.some(k => k in body)
    // permission gate (client access)
    if (admin.role !== 'master') {
      const kind = String(body.kind || '')
      const wantStatus = typeof body.status === 'string' ? body.status : ''
      const isGallery = kind === 'gallery'
      if (isGallery) {
        if (wantStatus === 'deleted') requirePermission(admin, 'galleries.delete')
        else requirePermission(admin, 'galleries.write')
      } else {
        if (wantStatus === 'deleted') requirePermission(admin, 'blessings.delete')
        else if (wantStatus && wantStatus !== 'approved') requirePermission(admin, 'blessings.moderate')
        else if (willEditFields) requirePermission(admin, 'blessings.moderate')
      }
    }
    for (const k of editableFields) {
      if (k in body) patch[k] = body[k] || null
    }

    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
    }

    const srv = supabaseServiceRole()
    let uq = srv.from('posts').update(patch).eq('id', id)
    // Scope event-access (code login) to its event
    if (admin.event_id) uq = uq.eq('event_id', admin.event_id)

    const { data, error } = await uq.select('*').single()
if (error) return NextResponse.json({ error: error.message }, { status: 500 })

// If deleted: also delete from storage to avoid orphaned files
if (patch.status === 'deleted' && (data as any)?.media_path) {
  const mediaPath = String((data as any).media_path || '')
  if (mediaPath) {
    try {
      await srv.storage.from('uploads').remove([mediaPath])
    } catch {}
    try {
      await srv.from('media_items').update({ deleted_at: new Date().toISOString() }).eq('storage_path', mediaPath)
    } catch {}
  }
}

return NextResponse.json({ ok: true, post: data })

  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
