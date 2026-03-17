// Path: src/app/api/public/home/route.ts
// Version: V24.6
// Updated: 2026-03-18 01:10
// Note: FIX wrong file (upload route). Restores correct home API + random blessings.

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

export async function GET(req: NextRequest) {
  try {
    const env = getServerEnv()

    const url = new URL(req.url)
    const eventFromQuery = String(url.searchParams.get('event') || '').trim()
    const eventId = eventFromQuery || env.EVENT_SLUG

    const { settings, blocks } = await fetchSettingsAndBlocks(eventId)

    const device_id = cookies().get('device_id')?.value || null

    const blessingsPreviewLimit = Number(settings?.blessings_preview_limit ?? 3)

    const blessingsPreview = await fetchBlessingsPreview(
      eventId,
      blessingsPreviewLimit,
      device_id
    )

    return NextResponse.json({
      ok: true,
      settings,
      blocks,
      blessingsPreview,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'home api error' },
      { status: 500 }
    )
  }
}
