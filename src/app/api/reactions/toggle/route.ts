import { NextRequest, NextResponse } from 'next/server'
import { supabaseServiceRole } from '@/lib/supabase'

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function getDeviceId(req: NextRequest) {
  const headerDevice = req.headers.get('x-device-id') || ''
  const cookieDevice = req.cookies.get('device_id')?.value || ''
  return String(headerDevice || cookieDevice || '').trim()
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const postId = String(body?.post_id || '').trim()
    const mediaItemId = String(body?.media_item_id || '').trim()
    const emoji = String(body?.emoji || '').trim()
    const deviceId = getDeviceId(req)

    if (!emoji) return jsonError('missing emoji', 400)
    if (!deviceId) return jsonError('missing device id', 400)
    if (!postId && !mediaItemId) return jsonError('missing target id', 400)
    if (postId && mediaItemId) return jsonError('only one target is allowed', 400)

    const sb = supabaseServiceRole()

    let baseQuery = sb
      .from('reactions')
      .select('id, emoji')
      .eq('device_id', deviceId)

    if (postId) {
      baseQuery = baseQuery.eq('post_id', postId).is('media_item_id', null)
    } else {
      baseQuery = baseQuery.eq('media_item_id', mediaItemId).is('post_id', null)
    }

    const existingRes = await baseQuery
    if (existingRes.error) return jsonError(existingRes.error.message, 500)

    const existingRows = existingRes.data || []
    const alreadySelected = existingRows.find((r: any) => String(r.emoji || '') === emoji)
    const previousEmoji = existingRows.find((r: any) => String(r.emoji || '') !== emoji)?.emoji || null

    if (alreadySelected) {
      const del = await sb.from('reactions').delete().eq('id', alreadySelected.id)
      if (del.error) return jsonError(del.error.message, 500)
    } else {
      if (existingRows.length > 0) {
        const ids = existingRows.map((r: any) => r.id).filter(Boolean)
        if (ids.length) {
          const delOld = await sb.from('reactions').delete().in('id', ids)
          if (delOld.error) return jsonError(delOld.error.message, 500)
        }
      }

      const ins = await sb.from('reactions').insert({
        post_id: postId || null,
        media_item_id: mediaItemId || null,
        device_id: deviceId,
        emoji,
      })
      if (ins.error) return jsonError(ins.error.message, 500)
    }

    let countsQuery = sb
      .from('reactions')
      .select('emoji')

    if (postId) {
      countsQuery = countsQuery.eq('post_id', postId).is('media_item_id', null)
    } else {
      countsQuery = countsQuery.eq('media_item_id', mediaItemId).is('post_id', null)
    }

    const countsRes = await countsQuery
    if (countsRes.error) return jsonError(countsRes.error.message, 500)

    const counts: Record<string, number> = {}
    for (const row of countsRes.data || []) {
      const e = String((row as any)?.emoji || '').trim()
      if (!e) continue
      counts[e] = Number(counts[e] || 0) + 1
    }

    const active = !alreadySelected

    return NextResponse.json({
      ok: true,
      emoji,
      active,
      count: Number(counts[emoji] || 0),
      counts,
      selected_emoji: active ? emoji : null,
      previous_emoji: alreadySelected ? emoji : previousEmoji,
    })
  } catch (e: any) {
    return jsonError(e?.message || 'server error', 500)
  }
}
