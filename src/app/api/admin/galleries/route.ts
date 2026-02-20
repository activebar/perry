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
  const { data, error } = await sb
    .from('galleries')
    .select('*')
    .eq('event_id', eventId)
    .order('order_index', { ascending: true })
  if (error) return jsonError(error.message, 500)

  // Also return the display name as defined in blocks.config (Admin -> "עיצוב ותוכן")
  const { data: blocks } = await sb
    .from('blocks')
    .select('id,type,is_visible,order_index,config,event_id')
    .eq('event_id', eventId)
    .or('type.eq.gallery,type.like.gallery_%')

  const titleByGalleryId = new Map<string, { title?: string; button_label?: string }>()
  for (const b of blocks || []) {
    const cfg: any = (b as any).config || {}
    const gid = String(cfg.gallery_id || '').trim()
    if (!gid) continue
    if (!titleByGalleryId.has(gid)) {
      titleByGalleryId.set(gid, {
        title: cfg.title,
        button_label: cfg.button_label
      })
    }
  }

  const galleries = (data || []).map((g: any) => {
    const extra = titleByGalleryId.get(String(g.id))
    return {
      ...g,
      display_title: extra?.title || g.title,
      display_button_label: extra?.button_label || null
    }
  })

  return NextResponse.json({ ok: true, galleries })
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

  // If title is changed here, also sync the matching gallery block config.title
  // so Admin "עיצוב ותוכן" and Admin galleries tab stay aligned.
  if (patch.title !== undefined) {
    const { data: blk } = await sb
      .from('blocks')
      .select('id,config')
      .eq('event_id', eventId)
      .or('type.eq.gallery,type.like.gallery_%')
      .limit(500)

    const toUpdate = (blk || []).filter((b: any) => String((b.config as any)?.gallery_id || '') === id)
    for (const b of toUpdate) {
      const cfg: any = b.config || {}
      const nextCfg = { ...cfg, title: patch.title }
      await sb
        .from('blocks')
        .update({ config: nextCfg })
        .eq('id', b.id)
        .eq('event_id', eventId)
    }
  }
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
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('unauthorized', 401)

  const body = await req.json().catch(() => ({}))
  const action = String(body.action || '').trim()

  const sb = supabaseServiceRole()
  const eventId = admin.event_id || getEventId()

  // ===== create a new gallery + matching block =====
  if (action === 'create') {
    if (admin.role !== 'master' && !admin.permissions?.galleries_create) return jsonError('forbidden', 403)

    const { data: existing, error: exErr } = await sb
      .from('galleries')
      .select('id')
      .eq('event_id', eventId)

    if (exErr) return jsonError(exErr.message, 500)
    const nextNum = (existing?.length || 0) + 1
    const title = String(body.title || `גלריה ${nextNum}`)

    const { data: gal, error: galErr } = await sb
      .from('galleries')
      .insert({
        event_id: eventId,
        title,
        upload_enabled: false,
        require_approval: true,
        auto_approve_until: null
      })
      .select('*')
      .single()

    if (galErr) return jsonError(galErr.message, 500)

    // Create a block for homepage/gallery index
    const { data: blocks, error: bErr } = await sb
      .from('blocks')
      .select('order_index')
      .eq('event_id', eventId)
      .order('order_index', { ascending: false })
      .limit(1)

    if (bErr) return jsonError(bErr.message, 500)
    const nextOrder = (blocks?.[0]?.order_index ?? 0) + 1

    const { error: insErr } = await sb.from('blocks').insert({
      event_id: eventId,
      type: 'gallery',
      order_index: nextOrder,
      is_visible: true,
      config: {
        gallery_id: gal.id,
        title,
        button_label: 'לכל התמונות',
        limit: 12
      }
    })

    if (insErr) return jsonError(insErr.message, 500)

    return NextResponse.json({ ok: true, gallery: gal })
  }

  // ===== clone an existing gallery + block =====
  if (action === 'clone') {
    if (admin.role !== 'master' && !admin.permissions?.galleries_create) return jsonError('forbidden', 403)
    const fromId = String(body.from_id || '').trim()
    if (!fromId) return jsonError('missing from_id', 400)

    const { data: from, error: fErr } = await sb
      .from('galleries')
      .select('*')
      .eq('id', fromId)
      .eq('event_id', eventId)
      .single()

    if (fErr) return jsonError(fErr.message, 500)

    const { data: existing, error: exErr } = await sb
      .from('galleries')
      .select('id')
      .eq('event_id', eventId)

    if (exErr) return jsonError(exErr.message, 500)

    const nextNum = (existing?.length || 0) + 1
    const title = String(body.title || `${from.title || 'גלריה'} (העתק ${nextNum})`)

    const { data: gal, error: galErr } = await sb
      .from('galleries')
      .insert({
        event_id: eventId,
        title,
        upload_enabled: false,
        require_approval: true,
        auto_approve_until: null
      })
      .select('*')
      .single()

    if (galErr) return jsonError(galErr.message, 500)

    const { data: blocks, error: bErr } = await sb
      .from('blocks')
      .select('order_index')
      .eq('event_id', eventId)
      .order('order_index', { ascending: false })
      .limit(1)

    if (bErr) return jsonError(bErr.message, 500)
    const nextOrder = (blocks?.[0]?.order_index ?? 0) + 1

    const { error: insErr } = await sb.from('blocks').insert({
      event_id: eventId,
      type: 'gallery',
      order_index: nextOrder,
      is_visible: true,
      config: {
        gallery_id: gal.id,
        title,
        button_label: 'לכל התמונות',
        limit: 12
      }
    })

    if (insErr) return jsonError(insErr.message, 500)

    return NextResponse.json({ ok: true, gallery: gal })
  }

  // ===== open uploads window (auto approve until) =====
  const id = String(body.id || '').trim()
  const hours = Number(body.hours || 8)
  if (admin.role !== 'master' && !admin.permissions?.galleries_open) return jsonError('forbidden', 403)
  if (!id) return jsonError('missing id', 400)

  const safeHours = Number.isFinite(hours) && hours > 0 ? Math.min(hours, 72) : 8
  const until = new Date(Date.now() + safeHours * 60 * 60 * 1000).toISOString()

  const { data, error } = await sb
    .from('galleries')
    .update({ upload_enabled: true, auto_approve_until: until, require_approval: true })
    .eq('id', id)
    .eq('event_id', eventId)
    .select('*')
    .single()

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ ok: true, gallery: data })
}
