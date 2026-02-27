import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAnon, supabaseServiceRole } from '@/lib/supabase'
import { getServerEnv } from '@/lib/env'

const EMOJIS = ['👍', '😍', '🔥', '🙏'] as const

async function fetchSettingsAndBlocks(eventId: string) {
  const sb = supabaseAnon()
  const [{ data: settings, error: sErr }, { data: blocks, error: bErr }] = await Promise.all([
    sb
      .from('event_settings')
      .select('*')
      .eq('event_id', eventId)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
    sb.from('blocks').select('*').eq('event_id', eventId).order('order_index', { ascending: true })
  ])
  if (sErr) throw sErr
  if (bErr) throw bErr
  return { settings, blocks: blocks || [] }
}

// Gallery previews are now driven by *gallery blocks* (one block per gallery).
// We keep /api/public/home focused on settings + blocks + blessings.


async function fetchGalleryPreviews(eventId: string, blocks: any[]) {
  const sb = supabaseAnon()
  const galleryBlocks = (blocks || []).filter((b: any) => {
    const t = String(b?.type || '')
    return t === 'gallery' || t.startsWith('gallery_')
  })
  const galleryIds = galleryBlocks
    .map((b: any) => (b?.config as any)?.gallery_id || (b?.config as any)?.galleryId)
    .filter((x: any) => typeof x === 'string' && x.length > 0)

  if (galleryIds.length === 0) return {}

  const { data, error } = await sb
    .from('media_items')
    .select('id, gallery_id, url, thumb_url, public_url, storage_path, created_at, kind, is_approved, crop_position')
    .eq('event_id', eventId)
    // IMPORTANT: Some rows use kind='galleries' (legacy). Show both.
    .in('kind', ['gallery', 'galleries'])
    .eq('is_approved', true)
    .in('gallery_id', galleryIds as any)
    .order('created_at', { ascending: false })
    .limit(600)

  if (error || !data) return {}

  // limit per gallery block (default 12)
  const limitById: Record<string, number> = {}
  for (const b of galleryBlocks) {
    const gid = (b?.config as any)?.gallery_id
    const lim = Number((b?.config as any)?.limit ?? 12)
    if (typeof gid === 'string' && gid) {
      limitById[gid] = Number.isFinite(lim) ? Math.max(0, Math.min(48, lim)) : 12
    }
  }

  // Group all items by gallery first
  const grouped: Record<string, any[]> = {}
  for (const it of data as any[]) {
    const gid = String((it as any).gallery_id || '')
    if (!gid) continue
    const url = String((it as any).thumb_url || (it as any).url || (it as any).public_url || '')
    if (!url) continue
    if (!grouped[gid]) grouped[gid] = []
    grouped[gid].push({
      id: (it as any).id,
      url,
      created_at: (it as any).created_at,
      crop_position: (it as any).crop_position ?? null
    })
  }

  // Randomize per gallery on every request (so refresh shows different photos)
  const out: Record<string, any[]> = {}
  for (const gid of Object.keys(grouped)) {
    const arr = grouped[gid] || []
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    out[gid] = arr.slice(0, limitById[gid] ?? 12)
  }

  return out
}


async function fetchBlessingsPreview(eventId: string, limit: number, device_id?: string | null) {
  const sb = supabaseAnon()
  const safeLimit = Math.max(0, Math.min(20, Number(limit || 0)))
  if (!safeLimit) return []

  // Keep deterministic per-event query here.
  // We intentionally do not use RPC random functions because they may not filter by event.
  const fallback = async () => {
  const { data, error } = await sb
    .from('posts')
    .select('id, author_name, text, media_url, link_url, created_at')
    .eq('event_id', eventId)
    .eq('kind', 'blessing')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(safeLimit)
  return { data, error }
}

  const final = await fallback()
  const postsFinal = final.data as any[] | null
  const errFinal = final.error

  if (errFinal || !postsFinal || postsFinal.length === 0) return []

  // counts + my reaction (service role)
  const ids = postsFinal.map(p => p.id)
  const srv = supabaseServiceRole()
  const { data: reactions } = await srv
    .from('reactions')
    .select('post_id, emoji, device_id')
    .in('post_id', ids)

  const countsById: Record<string, Record<string, number>> = {}
  const myById: Record<string, string | null> = {}

  for (const id of ids) {
    countsById[id] = { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 }
    myById[id] = null
  }

  for (const r of reactions || []) {
    const pid = (r as any).post_id
    const emo = (r as any).emoji
    if (!countsById[pid]) continue
    if (countsById[pid][emo] == null) continue
    countsById[pid][emo] += 1

    if (device_id && (r as any).device_id === device_id) {
      myById[pid] = emo
    }
  }

  return (postsFinal as any[]).map(p => ({
    ...p,
    reaction_counts: countsById[p.id] || { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 },
    my_reactions: myById[p.id] ? [myById[p.id]] : []
  }))
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  try {
    const env = getServerEnv()
    const url = new URL(req.url)
    const eventFromQuery = String(url.searchParams.get('event') || '').trim()
    const eventId = eventFromQuery || env.EVENT_SLUG

    const { settings, blocks } = await fetchSettingsAndBlocks(eventId)
    const device_id = cookies().get('device_id')?.value || null

    // visible types
    const now = new Date()
    const visibleTypes = new Set(
      (blocks || [])
        .filter((b: any) => {
          if (!b?.is_visible) return false
          if (b.type === 'gift' && b.config?.auto_hide_after_hours) {
            const hours = Number(b.config.auto_hide_after_hours)
            if (Number.isFinite(hours) && hours > 0) {
              const start = new Date(settings.start_at)
              const hideAt = new Date(start.getTime() + hours * 60 * 60 * 1000)
              if (now > hideAt) return false
            }
          }
          return true
        })
        .map((b: any) => b.type)
    )

    const blessingsPreviewLimit = Number(settings.blessings_preview_limit ?? 3)

    const blessingsPreview = await fetchBlessingsPreview(eventId, blessingsPreviewLimit, device_id)
    const galleryPreviews = await fetchGalleryPreviews(eventId, blocks)

// Enrich blessing preview items with thumb URLs for fast loading (use thumb_url in grids)
try {
  const urls = (blessingsPreview || [])
    .map((p: any) => (p as any).media_url)
    .filter((u: any) => typeof u === 'string' && u.length > 0)
  const uniq = Array.from(new Set(urls))
  if (uniq.length) {
    const { data: mediaRows } = await sb
      .from('media_items')
      .select('url, thumb_url')
      .eq('event_id', eventId)
      .in('url', uniq.slice(0, 200))
    const map = new Map<string, string>()
    ;(mediaRows || []).forEach((r: any) => {
      if (r?.url && r?.thumb_url) map.set(String(r.url), String(r.thumb_url))
    })
    ;(blessingsPreview || []).forEach((p: any) => {
      const tu = map.get(String((p as any).media_url || ''))
      if (tu) (p as any).media_thumb_url = tu
    })
  }
} catch {}

    return NextResponse.json({
      ok: true,
      settings,
      blocks,
      blessingsPreview,
      galleryPreviews
    })
  } catch (e: any) {

    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
