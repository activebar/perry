// Path: src/app/api/public/gallery-items/route.ts
// Version: V25.1
// Updated: 2026-03-20 10:50
// Note: return gallery reaction counts, my reactions, and top reaction for gallery items while including video kinds

import { NextRequest, NextResponse } from 'next/server'
import { supabaseServiceRole } from '@/lib/supabase'

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function getDeviceId(req: NextRequest) {
  return String(req.headers.get('x-device-id') || req.cookies.get('device_id')?.value || '').trim()
}

function canStillEdit(editableUntil?: string | null) {
  if (!editableUntil) return false
  const t = new Date(String(editableUntil)).getTime()
  return Number.isFinite(t) && t > Date.now()
}

function clamp01(v: unknown): number | null {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(1, n))
}

function normalizeCropPosition(v: unknown): 'top' | 'center' | 'bottom' {
  const s = String(v || '').trim().toLowerCase()
  if (s === 'top' || s === 'bottom') return s
  return 'center'
}

function buildReactionMaps(
  rows: any[],
  deviceId: string
): {
  reactionsByItem: Record<string, Record<string, number>>
  myReactionsByItem: Record<string, string[]>
  topReactionByItem: Record<string, { emoji: string; count: number } | null>
} {
  const reactionsByItem: Record<string, Record<string, number>> = {}
  const myReactionsByItem: Record<string, string[]> = {}

  for (const row of rows || []) {
    const itemId = String((row as any).media_item_id || '').trim()
    const emoji = String((row as any).emoji || '').trim()
    const rowDevice = String((row as any).device_id || '').trim()
    if (!itemId || !emoji) continue

    reactionsByItem[itemId] ||= {}
    reactionsByItem[itemId][emoji] = Number(reactionsByItem[itemId][emoji] || 0) + 1

    if (deviceId && rowDevice === deviceId) {
      myReactionsByItem[itemId] ||= []
      if (!myReactionsByItem[itemId].includes(emoji)) {
        myReactionsByItem[itemId].push(emoji)
      }
    }
  }

  const topReactionByItem: Record<string, { emoji: string; count: number } | null> = {}

  for (const [itemId, counts] of Object.entries(reactionsByItem)) {
    let bestEmoji = ''
    let bestCount = 0

    for (const [emoji, rawCount] of Object.entries(counts || {})) {
      const count = Number(rawCount || 0)
      if (count > bestCount) {
        bestEmoji = emoji
        bestCount = count
      }
    }

    topReactionByItem[itemId] =
      bestEmoji && bestCount > 0 ? { emoji: bestEmoji, count: bestCount } : null
  }

  return { reactionsByItem, myReactionsByItem, topReactionByItem }
}

export async function GET(req: NextRequest) {
  const galleryId = String(req.nextUrl.searchParams.get('gallery_id') || '').trim()
  const mediaItemIds = req.nextUrl.searchParams.getAll('media_item_id').map(String).filter(Boolean)
  const deviceId = getDeviceId(req)
  const sb = supabaseServiceRole()

  if (mediaItemIds.length > 0) {
    const { data: rows, error: rowsError } = await sb
      .from('reactions')
      .select('media_item_id, emoji, device_id')
      .in('media_item_id', mediaItemIds)

    if (rowsError) return jsonError(rowsError.message, 500)

    const { reactionsByItem, myReactionsByItem, topReactionByItem } = buildReactionMaps(
      rows || [],
      deviceId
    )

    return NextResponse.json({
      ok: true,
      reactionsByItem,
      myReactionsByItem,
      topReactionByItem,
    })
  }

  if (!galleryId) return jsonError('missing gallery_id', 400)

  const { data, error } = await sb
    .from('media_items')
    .select(
      'id, url, thumb_url, kind, crop_position, crop_focus_x, crop_focus_y, created_at, editable_until, uploader_device_id'
    )
    .eq('gallery_id', galleryId)
    .eq('is_approved', true)
    .in('kind', ['gallery', 'galleries', 'gallery_video', 'video'])
    .order('created_at', { ascending: false })

  if (error) return jsonError(error.message, 500)

  const items = data || []
  const ids = items.map((x: any) => String(x?.id || '').trim()).filter(Boolean)

  let reactionsByItem: Record<string, Record<string, number>> = {}
  let myReactionsByItem: Record<string, string[]> = {}
  let topReactionByItem: Record<string, { emoji: string; count: number } | null> = {}

  if (ids.length > 0) {
    const { data: reactionRows, error: reactionError } = await sb
      .from('reactions')
      .select('media_item_id, emoji, device_id')
      .in('media_item_id', ids)

    if (reactionError) return jsonError(reactionError.message, 500)

    const built = buildReactionMaps(reactionRows || [], deviceId)
    reactionsByItem = built.reactionsByItem
    myReactionsByItem = built.myReactionsByItem
    topReactionByItem = built.topReactionByItem
  }

  const enriched = items.map((item: any) => {
    const id = String(item?.id || '').trim()
    return {
      ...item,
      reaction_counts: reactionsByItem[id] || {},
      my_reactions: myReactionsByItem[id] || [],
      top_reaction: topReactionByItem[id] || null,
    }
  })

  return NextResponse.json({ ok: true, items: enriched })
}

export async function PUT(req: NextRequest) {
  const deviceId = getDeviceId(req)
  if (!deviceId) return jsonError('missing device id', 400)

  const body = await req.json().catch(() => ({}))
  const id = String(body?.id || '').trim()
  if (!id) return jsonError('missing id', 400)

  const sb = supabaseServiceRole()
  const rowRes = await sb
    .from('media_items')
    .select('id, editable_until, uploader_device_id')
    .eq('id', id)
    .single()

  if (rowRes.error) return jsonError(rowRes.error.message, 500)

  const row: any = rowRes.data
  if (!row) return jsonError('item not found', 404)
  if (String(row.uploader_device_id || '') !== deviceId) return jsonError('forbidden', 403)

  const cropOnly =
    !body?.replacement_url &&
    !('replacement_thumb_url' in body) &&
    !body?.replacement_storage_path &&
    !body?.replacement_kind &&
    ('crop_position' in body || 'crop_focus_x' in body || 'crop_focus_y' in body)

  if (!cropOnly && !canStillEdit(row.editable_until)) return jsonError('זמן העריכה הסתיים', 403)

  const patch: Record<string, any> = {}
  if (body?.replacement_url) patch.url = body.replacement_url
  if ('replacement_thumb_url' in body) patch.thumb_url = body.replacement_thumb_url || null
  if (body?.replacement_storage_path) patch.storage_path = body.replacement_storage_path
  if (body?.replacement_kind) patch.kind = body.replacement_kind
  if ('crop_position' in body) patch.crop_position = normalizeCropPosition(body.crop_position)
  if ('crop_focus_x' in body) patch.crop_focus_x = clamp01(body.crop_focus_x)
  if ('crop_focus_y' in body) patch.crop_focus_y = clamp01(body.crop_focus_y)

  const { data, error } = await sb.from('media_items').update(patch).eq('id', id).select('*').single()
  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ ok: true, item: data })
}

export async function DELETE(req: NextRequest) {
  const deviceId = getDeviceId(req)
  if (!deviceId) return jsonError('missing device id', 400)

  const body = await req.json().catch(() => ({}))
  const id = String(body?.id || '').trim()
  if (!id) return jsonError('missing id', 400)

  const sb = supabaseServiceRole()
  const rowRes = await sb
    .from('media_items')
    .select('id, editable_until, uploader_device_id, storage_path, url, thumb_url')
    .eq('id', id)
    .single()

  if (rowRes.error) return jsonError(rowRes.error.message, 500)

  const row: any = rowRes.data
  if (!row) return jsonError('item not found', 404)
  if (String(row.uploader_device_id || '') !== deviceId) return jsonError('forbidden', 403)
  if (!canStillEdit(row.editable_until)) return jsonError('זמן העריכה הסתיים', 403)

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

  const base =
    typeof row.storage_path === 'string' && row.storage_path.trim()
      ? row.storage_path.trim()
      : derivePath(row.url) || derivePath(row.thumb_url)

  if (base) {
    const paths: string[] = [base]
    if (!base.endsWith('.thumb.webp')) paths.push(...thumbCandidates(base))
    else paths.push(base.replace(/\.thumb\.webp$/, ''))
    await sb.storage.from('uploads').remove(Array.from(new Set(paths))).catch(() => null as any)
  }

  await sb.from('reactions').delete().eq('media_item_id', id)
  const { error } = await sb.from('media_items').delete().eq('id', id)
  if (error) return jsonError(error.message, 500)

  return NextResponse.json({ ok: true })
}
