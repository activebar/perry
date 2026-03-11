import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest, requireAnyPermission } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'
import { getEventIdFromRequest } from '@/lib/event-id'

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function isPlainObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function pickExistingKeys(source: Record<string, any> | null | undefined, keys: string[]) {
  const out: Record<string, any> = {}
  if (!source) return out
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      out[key] = source[key]
    }
  }
  return out
}

function extractGallerySequence(values: Array<string | null | undefined>) {
  let max = 0
  for (const raw of values) {
    const v = String(raw || '').trim()
    const m = v.match(/^gallery_(\d+)$/i)
    if (!m) continue
    const n = Number(m[1])
    if (Number.isFinite(n) && n > max) max = n
  }
  return max
}

async function getGalleryBlockByGalleryId(sb: ReturnType<typeof supabaseServiceRole>, eventId: string, galleryId: string) {
  const { data } = await sb
    .from('blocks')
    .select('id,type,is_visible,order_index,config,event_id')
    .eq('event_id', eventId)
    .like('type', 'gallery_%')
    .limit(500)

  const block = (data || []).find((b: any) => {
    const cfg = isPlainObject(b?.config) ? b.config : {}
    return String(cfg.gallery_id || '') === String(galleryId)
  })

  return block || null
}


async function findExistingCreatedGallery(sb: ReturnType<typeof supabaseServiceRole>, eventId: string, nextKey: string) {
  const { data: galleryRow } = await sb
    .from('galleries')
    .select('*')
    .eq('event_id', eventId)
    .eq('title', nextKey)
    .maybeSingle()

  const { data: blockRow } = await sb
    .from('blocks')
    .select('id,type,is_visible,order_index,config,event_id')
    .eq('event_id', eventId)
    .eq('type', nextKey)
    .maybeSingle()

  return { galleryRow: galleryRow || null, blockRow: blockRow || null }
}

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('unauthorized', 401)

  try {
    requireAnyPermission(admin, ['galleries.read', 'galleries.manage', 'site.manage'])
  } catch {
    return jsonError('forbidden', 403)
  }

  const eventId = admin.event_id || getEventIdFromRequest(req)

  const sb = supabaseServiceRole()
  const { data, error } = await sb
    .from('galleries')
    .select('*')
    .eq('event_id', eventId)
    .order('order_index', { ascending: true })

  if (error) return jsonError(error.message, 500)

  const { data: blocks } = await sb
    .from('blocks')
    .select('id,type,is_visible,order_index,config,event_id')
    .eq('event_id', eventId)
    .like('type', 'gallery_%')

  const titleByGalleryId = new Map<string, { title?: string; button_label?: string }>()
  for (const b of blocks || []) {
    const cfg: any = isPlainObject((b as any).config) ? (b as any).config : {}
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

  const galleriesWithCounts = await Promise.all(
    galleries.map(async (g: any) => {
      const { count } = await sb
        .from('media_items')
        .select('id', { count: 'exact', head: true })
        .eq('gallery_id', g.id)
        .eq('is_approved', false)

      return { ...g, pending_count: count || 0 }
    })
  )

  const total_pending = galleriesWithCounts.reduce((sum: number, g: any) => sum + (g.pending_count || 0), 0)

  return NextResponse.json({ ok: true, galleries: galleriesWithCounts, total_pending })
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
  const eventId = admin.event_id || getEventIdFromRequest(req)

  if (patch.title !== undefined) {
    const { data: blk } = await sb
      .from('blocks')
      .select('id,config')
      .eq('event_id', eventId)
      .like('type', 'gallery_%')
      .limit(500)

    const toUpdate = (blk || []).filter((b: any) => String((b.config as any)?.gallery_id || '') === id)

    for (const b of toUpdate) {
      const cfg: any = isPlainObject(b.config) ? b.config : {}
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
  const eventId = admin.event_id || getEventIdFromRequest(req)

  const requestedCreate =
    action === 'create' ||
    action === 'clone' ||
    (!action && !String(body.id || '').trim())

  if (requestedCreate) {
    if (admin.role !== 'master' && !admin.permissions?.galleries_create) {
      return jsonError('forbidden', 403)
    }

    const { data: existing, error: exErr } = await sb
      .from('galleries')
      .select('*')
      .eq('event_id', eventId)
      .order('order_index', { ascending: true })

    if (exErr) return jsonError(exErr.message, 500)

    const { data: allBlocks, error: blocksErr } = await sb
      .from('blocks')
      .select('id,type,is_visible,order_index,config,event_id')
      .eq('event_id', eventId)
      .like('type', 'gallery_%')
      .order('order_index', { ascending: true })

    if (blocksErr) return jsonError(blocksErr.message, 500)

    const nextSeq =
      extractGallerySequence([
        ...(existing || []).map((g: any) => g?.title),
        ...(allBlocks || []).map((b: any) => b?.type),
      ]) + 1

    const nextKey = `gallery_${nextSeq}`

    const existingCreated = await findExistingCreatedGallery(sb, eventId, nextKey)
    if (existingCreated.galleryRow) {
      return NextResponse.json({
        ok: true,
        gallery: existingCreated.galleryRow,
        created: {
          gallery_key: nextKey,
          display_title: String(existingCreated.blockRow?.config?.title || existingCreated.galleryRow.title || nextKey)
        }
      })
    }

    let templateGallery: any = null
    let templateBlock: any = null

    const templateGalleryId =
      String(body.template_gallery_id || body.from_id || '').trim()

    if (templateGalleryId) {
      templateGallery = (existing || []).find((g: any) => String(g.id) === templateGalleryId) || null
    }

    if (!templateGallery && (existing || []).length > 0) {
      templateGallery = (existing || [])[existing.length - 1]
    }

    if (templateGallery?.id) {
      templateBlock = await getGalleryBlockByGalleryId(sb, eventId, String(templateGallery.id))
    }

    const templateGalleryFields = pickExistingKeys(templateGallery, [
      'upload_enabled',
      'require_approval',
      'upload_default_hours',
      'web_max_dimension',
      'is_active',
      'editable_until',
      'uploader_device_id',
      'crop_position'
    ])

    const insertGallery: Record<string, any> = {
      event_id: eventId,
      title: nextKey,
      order_index: (existing?.length || 0) + 1,
      ...templateGalleryFields
    }

    if (!Object.prototype.hasOwnProperty.call(insertGallery, 'upload_enabled')) {
      insertGallery.upload_enabled = false
    }
    if (!Object.prototype.hasOwnProperty.call(insertGallery, 'require_approval')) {
      insertGallery.require_approval = true
    }
    if (!Object.prototype.hasOwnProperty.call(insertGallery, 'is_active')) {
      insertGallery.is_active = true
    }
    if (!Object.prototype.hasOwnProperty.call(insertGallery, 'auto_approve_until')) {
      insertGallery.auto_approve_until = null
    } else {
      insertGallery.auto_approve_until = null
    }

    const { data: gal, error: galErr } = await sb
      .from('galleries')
      .insert(insertGallery)
      .select('*')
      .single()

    if (galErr) return jsonError(galErr.message, 500)

    const { data: lastBlockRows, error: lastBlockErr } = await sb
      .from('blocks')
      .select('order_index')
      .eq('event_id', eventId)
      .order('order_index', { ascending: false })
      .limit(1)

    if (lastBlockErr) return jsonError(lastBlockErr.message, 500)

    const nextBlockOrder = (lastBlockRows?.[0]?.order_index ?? 0) + 1

    const templateCfg = isPlainObject(templateBlock?.config) ? templateBlock.config : {}
    const blockTitle =
      String(body.display_title || templateCfg.title || `גלריה ${nextSeq}`).trim() || `גלריה ${nextSeq}`

    const blockConfig = {
      ...templateCfg,
      gallery_id: gal.id,
      title: blockTitle,
      button_label: String(templateCfg.button_label || 'לכל התמונות'),
      limit: Number(templateCfg.limit || 12) || 12
    }

    const existingCreated = await findExistingCreatedGallery(sb, eventId, nextKey)

    const { data: cleanupBlocks } = await sb
      .from('blocks')
      .select('id,type,config,created_at')
      .eq('event_id', eventId)
      .eq('type', 'gallery')
      .limit(50)

    const duplicateLegacyBlocks = (cleanupBlocks || []).filter((b: any) => {
      const cfg = isPlainObject(b?.config) ? b.config : {}
      return String(cfg.gallery_id || '') === String(gal.id)
    })

    for (const row of duplicateLegacyBlocks) {
      await sb.from('blocks').delete().eq('id', row.id).eq('event_id', eventId)
    }

    return NextResponse.json({
      ok: true,
      gallery: gal,
      created: {
        gallery_key: nextKey,
        display_title: blockTitle
      }
    })
  }

  const id = String(body.id || '').trim()
  const hours = Number(body.hours || 8)

  if (admin.role !== 'master' && !admin.permissions?.galleries_open) {
    return jsonError('forbidden', 403)
  }

  if (!id) return jsonError('missing id', 400)

  const safeHours = Number.isFinite(hours) && hours > 0 ? Math.min(hours, 72) : 8
  const until = new Date(Date.now() + safeHours * 60 * 60 * 1000).toISOString()

  const { data, error } = await sb
    .from('galleries')
    .update({
      upload_enabled: true,
      auto_approve_until: until,
      require_approval: true
    })
    .eq('id', id)
    .eq('event_id', eventId)
    .select('*')
    .single()

  if (error) return jsonError(error.message, 500)

  return NextResponse.json({ ok: true, gallery: data })
}
