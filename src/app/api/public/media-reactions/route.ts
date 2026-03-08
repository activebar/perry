import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Emoji = '👍' | '😍' | '🔥' | '🙏'
type ReactionCounts = Record<Emoji, number>

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

async function ensureAnchorPostForMedia(mediaItemId: string, deviceId: string) {
  const srv = supabaseServiceRole()
  const { data: media, error } = await srv
    .from('media_items')
    .select('id, post_id, event_id, gallery_id, public_url, url, storage_path, uploader_device_id')
    .eq('id', mediaItemId)
    .maybeSingle()

  if (error) throw error
  if (!media) throw new Error('media not found')

  const existingPostId = String((media as any).post_id || '').trim()
  if (existingPostId) return { srv, media, postId: existingPostId }

  const insert = {
    event_id: String((media as any).event_id || '').trim(),
    kind: 'gallery',
    author_name: null,
    text: null,
    media_path: String((media as any).storage_path || '').trim() || null,
    media_url: String((media as any).public_url || (media as any).url || '').trim() || null,
    video_url: null,
    link_url: null,
    status: 'approved',
    device_id: String((media as any).uploader_device_id || deviceId || '').trim() || null,
    gallery_id: (media as any).gallery_id || null,
  }

  const { data: post, error: perr } = await srv.from('posts').insert(insert as any).select('id').single()
  if (perr) throw perr

  await srv.from('media_items').update({ post_id: (post as any).id, kind: 'gallery' }).eq('id', mediaItemId)
  return { srv, media, postId: String((post as any).id) }
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

    const srv = supabaseServiceRole()
    const { data: mediaRows, error: merr } = await srv
      .from('media_items')
      .select('id, post_id')
      .in('id', ids)
    if (merr) throw merr

    const mediaToPost = new Map<string, string>()
    const postIds = [] as string[]
    for (const row of mediaRows || []) {
      const mediaId = String((row as any).id || '').trim()
      const postId = String((row as any).post_id || '').trim()
      if (mediaId && postId) {
        mediaToPost.set(mediaId, postId)
        postIds.push(postId)
      }
    }

    const countsById: Record<string, ReactionCounts> = {}
    const myById: Record<string, Emoji | null> = {}
    for (const id of ids) {
      countsById[id] = { ...EMPTY_COUNTS }
      myById[id] = null
    }

    if (postIds.length === 0) {
      return NextResponse.json({ countsById, myById })
    }

    const { data, error } = await srv
      .from('reactions')
      .select('post_id, emoji, device_id')
      .in('post_id', postIds)
    if (error) throw error

    const deviceId = getDeviceId(req)
    const postToMedia = new Map<string, string>()
    for (const [mediaId, postId] of mediaToPost.entries()) postToMedia.set(postId, mediaId)

    for (const row of data || []) {
      const postId = String((row as any).post_id || '')
      const mediaId = postToMedia.get(postId) || ''
      const emoji = String((row as any).emoji || '')
      if (!mediaId || !isEmoji(emoji)) continue
      countsById[mediaId][emoji] = Number(countsById[mediaId][emoji] || 0) + 1
      if (deviceId && String((row as any).device_id || '') === deviceId) myById[mediaId] = emoji
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

    const { srv, postId } = await ensureAnchorPostForMedia(mediaItemId, deviceId)

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

    return NextResponse.json({ ok: true, counts, my })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
