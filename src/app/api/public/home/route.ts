// Path: src/app/api/public/home/route.ts
// Version: V24.7
// Updated: 2026-03-19 15:05
// Note: add galleryPreviews to home API so sub-gallery previews render on event home page

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAnon, supabaseServiceRole } from '@/lib/supabase'
import { getServerEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function shuffle(arr: any[]) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function fetchSettingsAndBlocks(eventId: string) {
  const sb = supabaseAnon()

  const [{ data: settings }, { data: blocks }] = await Promise.all([
    sb
      .from('event_settings')
      .select('*')
      .eq('event_id', eventId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single(),
    sb.from('blocks').select('*').eq('event_id', eventId).order('order_index'),
  ])

  return {
    settings,
    blocks: blocks || [],
  }
}

async function fetchBlessingsPreview(eventId: string, limit: number, device_id?: string | null) {
  const sb = supabaseAnon()

  const { data: posts } = await sb
    .from('posts')
    .select('id, author_name, text, media_url, video_url, created_at')
    .eq('event_id', eventId)
    .eq('kind', 'blessing')
    .eq('status', 'approved')

  if (!posts || posts.length === 0) return []

  const shuffled = shuffle(posts).slice(0, limit)

  const ids = shuffled.map((p: any) => p.id)

  const srv = supabaseServiceRole()

  const [{ data: reactions }, { data: mediaRows }] = await Promise.all([
    srv.from('reactions').select('post_id, emoji, device_id').in('post_id', ids),
    srv
      .from('media_items')
      .select('post_id, url, thumb_url, crop_position, crop_focus_x, crop_focus_y, kind')
      .eq('event_id', eventId)
      .in('post_id', ids),
  ])

  const mediaByPost: Record<string, any> = {}
  for (const r of mediaRows || []) {
    const pid = String((r as any).post_id)
    if (!mediaByPost[pid]) mediaByPost[pid] = r
  }

  const counts: Record<string, any> = {}
  const my: Record<string, any> = {}

  for (const id of ids) {
    counts[id] = { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 }
    my[id] = null
  }

  for (const r of reactions || []) {
    const pid = String((r as any).post_id)
    const emo = String((r as any).emoji)

    if (counts[pid] && counts[pid][emo] != null) counts[pid][emo]++

    if (device_id && String((r as any).device_id) === device_id) {
      my[pid] = emo
    }
  }

  return shuffled.map((p: any) => {
    const media = mediaByPost[p.id] || {}

    const mediaUrl = media.url || media.thumb_url || p.media_url || null
    const videoUrl = p.video_url || (media.kind?.includes('video') ? mediaUrl : null)

    return {
      ...p,
      media_url: videoUrl ? null : mediaUrl,
      video_url: videoUrl,
      crop_position: media.crop_position ?? null,
      crop_focus_x: media.crop_focus_x ?? null,
      crop_focus_y: media.crop_focus_y ?? null,
      reaction_counts: counts[p.id],
      my_reactions: my[p.id] ? [my[p.id]] : [],
    }
  })
}

async function fetchGalleryPreviews(eventId: string, blocks: any[]) {
  const srv = supabaseServiceRole()

  const galleryBlocks = (blocks || []).filter((b: any) => {
    const type = String(b?.type || '')
    return type === 'gallery' || type.startsWith('gallery_')
  })

  const galleryIds = galleryBlocks
    .map((b: any) => String((b?.config || {}).gallery_id || '').trim())
    .filter(Boolean)

  if (galleryIds.length === 0) return {}

  const { data: rows } = await srv
    .from('media_items')
    .select(
      'id, gallery_id, url, thumb_url, kind, crop_position, crop_focus_x, crop_focus_y, created_at'
    )
    .eq('event_id', eventId)
    .eq('is_approved', true)
    .in('gallery_id', galleryIds as any)
    .in('kind', ['gallery', 'video'])
    .order('created_at', { ascending: false })
    .limit(800)

  const grouped: Record<string, any[]> = {}

  for (const gid of galleryIds) {
    grouped[gid] = []
  }

  for (const row of rows || []) {
    const gid = String((row as any).gallery_id || '').trim()
    if (!gid) continue
    if (!grouped[gid]) grouped[gid] = []
    grouped[gid].push({
      id: row.id,
      gallery_id: row.gallery_id,
      url: row.url,
      thumb_url: row.thumb_url,
      kind: row.kind,
      crop_position: row.crop_position ?? null,
      crop_focus_x: row.crop_focus_x ?? null,
      crop_focus_y: row.crop_focus_y ?? null,
      created_at: row.created_at,
    })
  }

  for (const block of galleryBlocks) {
    const cfg = (block as any)?.config || {}
    const gid = String(cfg.gallery_id || '').trim()
    if (!gid) continue

    const limit = Math.max(1, Number(cfg.limit || 6))
    const items = grouped[gid] || []

    grouped[gid] = shuffle(items).slice(0, limit)
  }

  return grouped
}

export async function GET(req: NextRequest) {
  try {
    const env = getServerEnv()

    const url = new URL(req.url)
    const eventFromQuery = String(url.searchParams.get('event') || '').trim()
    const eventId = eventFromQuery || env.EVENT_SLUG

    const { settings, blocks } = await fetchSettingsAndBlocks(eventId)

    const device_id = cookies().get('device_id')?.value || null

    const blessingsPreviewLimit = Number(settings?.blessings_preview_limit ?? 3)

    const [blessingsPreview, galleryPreviews] = await Promise.all([
      fetchBlessingsPreview(eventId, blessingsPreviewLimit, device_id),
      fetchGalleryPreviews(eventId, blocks || []),
    ])

    return NextResponse.json({
      ok: true,
      settings,
      blocks,
      blessingsPreview,
      galleryPreviews,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'home api error' },
      { status: 500 }
    )
  }
}
