import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const EMOJIS = ['👍', '😍', '🔥', '🙏'] as const
const EMOJI_SET = new Set<string>(EMOJIS)

function emptyCounts() {
  return { '👍': 0, '😍': 0, '🔥': 0, '🙏': 0 }
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

function uniqueIds(input: unknown) {
  if (!Array.isArray(input)) return []
  return Array.from(new Set(input.map(x => String(x || '').trim()).filter(x => /^[0-9a-f-]{36}$/i.test(x))))
}

async function ensureReactionPostForMedia(mediaItemId: string) {
  const srv = supabaseServiceRole()
  const { data: media, error } = await srv
    .from('media_items')
    .select('id, post_id, event_id, public_url, url')
    .eq('id', mediaItemId)
    .maybeSingle()

  if (error) throw error
  if (!media) throw new Error('media not found')

  const existingPostId = String((media as any).post_id || '').trim()
  if (existingPostId) return { postId: existingPostId }

  const { data: inserted, error: insertError } = await srv
    .from('posts')
    .insert({
      event_id: String((media as any).event_id || 'default'),
      kind: 'gallery',
      status: 'approved',
      media_url: String((media as any).public_url || (media as any).url || '') || null,
      text: null,
      author_name: null,
      link_url: null,
      video_url: null,
      device_id: null,
    })
    .select('id')
    .single()

  if (insertError) throw insertError

  await srv
    .from('media_items')
    .update({ post_id: (inserted as any).id })
    .eq('id', mediaItemId)
    .is('post_id', null)

  const { data: refreshed } = await srv
    .from('media_items')
    .select('post_id')
    .eq('id', mediaItemId)
    .maybeSingle()

  const postId = String((refreshed as any)?.post_id || (inserted as any)?.id || '').trim()
  if (!postId) throw new Error('failed to bind reaction post')
  return { postId }
}

async function buildBundle(ids: string[], deviceId: string | null) {
  const srv = supabaseServiceRole()
  const { data: mediaRows, error: mediaError } = await srv
    .from('media_items')
    .select('id, post_id')
    .in('id', ids as any)

  if (mediaError) throw mediaError

  const postIds: string[] = Array.from(new Set((mediaRows || []).map((row: any) => String(row.post_id || '').trim()).filter((value: string) => Boolean(value))))
  let reactionRows: any[] = []

  if (postIds.length > 0) {
    const { data, error } = await srv
      .from('reactions')
      .select('post_id, emoji, device_id')
      .in('post_id', postIds as any)

    if (error) throw error
    reactionRows = data || []
  }

  const byPostId: Record<string, { counts: Record<string, number>; my: string[] }> = {}
  for (const pid of postIds) byPostId[pid] = { counts: emptyCounts(), my: [] }

  for (const row of reactionRows) {
    const pid = String((row as any).post_id || '').trim()
    const emoji = String((row as any).emoji || '')
    if (!pid || !EMOJI_SET.has(emoji)) continue
    byPostId[pid] ||= { counts: emptyCounts(), my: [] }
    byPostId[pid].counts[emoji] = (byPostId[pid].counts[emoji] || 0) + 1
    if (deviceId && String((row as any).device_id || '') === deviceId && !byPostId[pid].my.includes(emoji)) {
      byPostId[pid].my.push(emoji)
    }
  }

  const out: Record<string, { counts: Record<string, number>; my: string[] }> = {}
  for (const row of mediaRows || []) {
    const mediaId = String((row as any).id || '').trim()
    const postId = String((row as any).post_id || '').trim()
    out[mediaId] = postId && byPostId[postId] ? byPostId[postId] : { counts: emptyCounts(), my: [] }
  }

  return out
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const deviceId = cookies().get('device_id')?.value || String(body?.device_id || '').trim() || null

    const ids = uniqueIds(body?.ids)
    if (ids.length > 0 && !body?.emoji && !body?.media_item_id) {
      const items = await buildBundle(ids, deviceId)
      return NextResponse.json({ ok: true, items }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
    }

    const mediaItemId = String(body?.media_item_id || body?.mediaItemId || '').trim()
    const emoji = String(body?.emoji || '').trim()
    if (!mediaItemId || !/^[0-9a-f-]{36}$/i.test(mediaItemId)) return jsonError('missing media_item_id')
    if (!EMOJI_SET.has(emoji)) return jsonError('invalid emoji')
    if (!deviceId) return jsonError('missing device_id', 400)

    const srv = supabaseServiceRole()
    const { postId } = await ensureReactionPostForMedia(mediaItemId)

    const { data: existingSame } = await srv
      .from('reactions')
      .select('id')
      .eq('post_id', postId)
      .eq('device_id', deviceId)
      .eq('emoji', emoji)
      .limit(1)

    if (existingSame && existingSame.length) {
      await srv.from('reactions').delete().eq('id', (existingSame[0] as any).id)
    } else {
      await srv.from('reactions').delete().eq('post_id', postId).eq('device_id', deviceId)
      await srv.from('reactions').insert({ post_id: postId, device_id: deviceId, emoji })
    }

    const { data: rows, error } = await srv.from('reactions').select('emoji').eq('post_id', postId)
    if (error) return jsonError(error.message, 500)

    const counts = emptyCounts()
    for (const row of rows || []) {
      const value = String((row as any).emoji || '')
      if ((EMOJIS as readonly string[]).includes(value as any)) counts[value as keyof ReturnType<typeof emptyCounts>] = (counts[value as keyof ReturnType<typeof emptyCounts>] || 0) + 1
    }

    const { data: myRow } = await srv
      .from('reactions')
      .select('emoji')
      .eq('post_id', postId)
      .eq('device_id', deviceId)
      .limit(1)

    const my = myRow && myRow.length ? [String((myRow[0] as any).emoji || '')] : []
    return NextResponse.json({ ok: true, counts, my }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (e: any) {
    return jsonError(e?.message || 'error', 500)
  }
}
