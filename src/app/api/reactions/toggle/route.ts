import { NextRequest, NextResponse } from 'next/server'
import { supabaseServiceRole } from '@/lib/supabase'

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function getDeviceId(req: NextRequest) {
  const bodyDevice = req.headers.get('x-device-id') || ''
  const cookieDevice = req.cookies.get('device_id')?.value || ''
  return String(bodyDevice || cookieDevice || '').trim()
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
    if (!postId && !mediaItemId) {
      return jsonError('missing target id', 400)
    }
    if (postId && mediaItemId) {
      return jsonError('only one target is allowed', 400)
    }

    const sb = supabaseServiceRole()

    let query = sb
      .from('reactions')
      .select('id')
      .eq('device_id', deviceId)
      .eq('emoji', emoji)

    if (postId) query = query.eq('post_id', postId).is('media_item_id', null)
    if (mediaItemId) query = query.eq('media_item_id', mediaItemId).is('post_id', null)

    const existingRes = await query.maybeSingle()

    if (existingRes.error) {
      return jsonError(existingRes.error.message, 500)
    }

    if (existingRes.data?.id) {
      const del = await sb.from('reactions').delete().eq('id', existingRes.data.id)
      if (del.error) return jsonError(del.error.message, 500)
    } else {
      const ins = await sb.from('reactions').insert({
        post_id: postId || null,
        media_item_id: mediaItemId || null,
        device_id: deviceId,
        emoji,
      })
      if (ins.error) return jsonError(ins.error.message, 500)
    }

    let countQuery = sb
      .from('reactions')
      .select('id', { count: 'exact', head: true })
      .eq('emoji', emoji)

    if (postId) countQuery = countQuery.eq('post_id', postId).is('media_item_id', null)
    if (mediaItemId) countQuery = countQuery.eq('media_item_id', mediaItemId).is('post_id', null)

    const countRes = await countQuery
    if (countRes.error) return jsonError(countRes.error.message, 500)

    return NextResponse.json({
      ok: true,
      emoji,
      count: Number(countRes.count || 0),
      active: !existingRes.data?.id,
    })
  } catch (e: any) {
    return jsonError(e?.message || 'server error', 500)
  }
}
