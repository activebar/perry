import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Emoji = '👍' | '😍' | '🔥' | '🙏'
type ReactionCounts = Record<Emoji, number>

type MediaAnchorRow = {
  id: string
  post_id: string | null
  event_id: string | null
  gallery_id: string | null
  public_url: string | null
  thumb_url: string | null
}

const EMOJIS = ['👍', '😍', '🔥', '🙏'] as const
const EMOJI_SET = new Set<string>(EMOJIS)
const EMPTY_COUNTS: ReactionCounts = { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 }

function isEmoji(value: string): value is Emoji {
  return EMOJI_SET.has(value)
}

function getDeviceId(req?: NextRequest, bodyDeviceId?: string | null) {
  const fromBody = String(bodyDeviceId || '').trim()
  if (fromBody) return fromBody
  const fromQuery = String(req?.nextUrl.searchParams.get('device_id') || '').trim()
  if (fromQuery) return fromQuery
  return cookies().get('device_id')?.value || ''
}

async function loadMediaAnchors(ids: string[]) {
  const cleanIds = ids.map(x => String(x || '').trim()).filter(Boolean)
  if (cleanIds.length === 0) return new Map<string, MediaAnchorRow>()

  const srv = supabaseServiceRole()
  const { data, error } = await srv
    .from('media_items')
    .select('id, post_id, event_id, gallery_id, public_url, thumb_url')
    .in('id', cleanIds)

  if (error) throw error

  const out = new Map<string, MediaAnchorRow>()
  for (const row of (data || []) as any[]) {
    out.set(String(row.id), {
      id: String(row.id),
      post_id: row.post_id ? String(row.post_id) : null,
      event_id: row.event_id ? String(row.event_id) : null,
      gallery_id: row.gallery_id ? String(row.gallery_id) : null,
      public_url: row.public_url ? String(row.public_url) : null,
      thumb_url: row.thumb_url ? String(row.thumb_url) : null,
    })
  }
  return out
}

async function ensureAnchorPost(mediaId: string) {
  const mediaMap = await loadMediaAnchors([mediaId])
  const media = mediaMap.get(mediaId)
  if (!media) throw new Error('media not found')
  if (media.post_id) return media.post_id

  const srv = supabaseServiceRole()
  const insert = {
    event_id: media.event_id,
    gallery_id: media.gallery_id,
    kind: 'gallery',
    status: 'approved',
    media_url: media.public_url || media.thumb_url || null,
    device_id: null,
  }

  const { data: created, error: createError } = await srv.from('posts').insert(insert).select('id').single()
  if (createError) throw createError

  const postId = String((created as any)?.id || '')
  if (!postId) throw new Error('anchor post not created')

  await srv.from('media_items').update({ post_id: postId }).eq('id', mediaId)
  return postId
}

export async function GET(req: NextRequest) {
  try {
    const ids = String(req.nextUrl.searchParams.get('ids') || '')
      .split(',')
      .map(x => x.trim())
      .filter(Boolean)

    if (ids.length === 0) {
      return NextResponse.json({ countsById: {}, myById: {} })
    }

    const mediaMap = await loadMediaAnchors(ids)
    const postIds = Array.from(new Set(ids.map(id => mediaMap.get(id)?.post_id || '').filter(Boolean)))

    const countsById: Record<string, ReactionCounts> = {}
    const myById: Record<string, Emoji | null> = {}
    for (const id of ids) {
      countsById[id] = { ...EMPTY_COUNTS }
      myById[id] = null
    }

    if (postIds.length === 0) {
      return NextResponse.json({ countsById, myById })
    }

    const srv = supabaseServiceRole()
    const { data, error } = await srv
      .from('reactions')
      .select('post_id, emoji, device_id')
      .in('post_id', postIds)

    if (error) throw error

    const deviceId = getDeviceId(req)
    const countsByPostId: Record<string, ReactionCounts> = {}
    const myByPostId: Record<string, Emoji | null> = {}
    for (const pid of postIds) {
      countsByPostId[pid] = { ...EMPTY_COUNTS }
      myByPostId[pid] = null
    }

    for (const row of data || []) {
      const postId = String((row as any).post_id || '')
      const emoji = String((row as any).emoji || '')
      if (!postId || !isEmoji(emoji)) continue
      if (!countsByPostId[postId]) countsByPostId[postId] = { ...EMPTY_COUNTS }
      countsByPostId[postId][emoji] = Number(countsByPostId[postId][emoji] || 0) + 1
      if (deviceId && String((row as any).device_id || '') === deviceId) myByPostId[postId] = emoji
    }

    for (const id of ids) {
      const postId = mediaMap.get(id)?.post_id || ''
      if (!postId) continue
      countsById[id] = { ...(countsByPostId[postId] || EMPTY_COUNTS) }
      myById[id] = myByPostId[postId] || null
    }

    return NextResponse.json({ countsById, myById })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const mediaItemId = String(body?.media_item_id || body?.mediaItemId || '').trim()
    const emoji = String(body?.emoji || '').trim()
    const deviceId = getDeviceId(req, body?.device_id || body?.deviceId || null)

    if (!mediaItemId || !isEmoji(emoji)) {
      return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
    }
    if (!deviceId) {
      return NextResponse.json({ error: 'missing device_id' }, { status: 400 })
    }

    const postId = await ensureAnchorPost(mediaItemId)
    const srv = supabaseServiceRole()

    const { data: existing } = await srv
      .from('reactions')
      .select('id, emoji')
      .eq('post_id', postId)
      .eq('device_id', deviceId)
      .limit(1)

    const currentEmoji = String(existing?.[0]?.emoji || '')
    if (existing?.[0]?.id && currentEmoji === emoji) {
      await srv.from('reactions').delete().eq('id', existing[0].id)
    } else {
      await srv.from('reactions').delete().eq('post_id', postId).eq('device_id', deviceId)
      await srv.from('reactions').insert({ post_id: postId, device_id: deviceId, emoji })
    }

    const { data: rows, error } = await srv.from('reactions').select('emoji, device_id').eq('post_id', postId)
    if (error) throw error

    const counts: ReactionCounts = { ...EMPTY_COUNTS }
    let my: Emoji[] = []

    for (const row of rows || []) {
      const currentEmoji = String((row as any).emoji || '')
      if (!isEmoji(currentEmoji)) continue
      counts[currentEmoji] = Number(counts[currentEmoji] || 0) + 1
      if (String((row as any).device_id || '') === deviceId) my = [currentEmoji]
    }

    return NextResponse.json({ ok: true, counts, my, post_id: postId })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
