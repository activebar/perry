import { NextResponse } from 'next/server'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Body = {
  kind?: 'bl' | 'gl' | string
  post_id?: string
  postId?: string
  media_item_id?: string
  mediaItemId?: string
  event_id?: string
  eventId?: string
  code?: string
  target_path?: string
  targetPath?: string
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

function cleanCode(input: string) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z]/g, '')
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return jsonError('Invalid JSON')
  }

  const kind = String(body.kind || '').trim() || 'bl'
  const postId = String(body.post_id || body.postId || '').trim()
  const mediaItemId = String(body.media_item_id || body.mediaItemId || '').trim()
  const explicitEventId = String(body.event_id || body.eventId || '').trim() || ''

  if (postId && mediaItemId) return jsonError('Provide either post_id or media_item_id, not both')

  const code = cleanCode(body.code || (postId ? postId.slice(0, 8) : mediaItemId ? mediaItemId.slice(0, 8) : ''))
  if (!/^[0-9a-f]{6,16}$/.test(code)) return jsonError('Invalid code format')

  const srv = supabaseServiceRole()

  let resolvedEventId = explicitEventId || ''
  if (!resolvedEventId && postId) {
    const { data: p } = await srv.from('posts').select('id,event_id').eq('id', postId).maybeSingle()
    resolvedEventId = String((p as any)?.event_id || '').trim()
  }
  if (!resolvedEventId && mediaItemId) {
    const { data: m } = await srv.from('media_items').select('id,event_id').eq('id', mediaItemId).maybeSingle()
    resolvedEventId = String((m as any)?.event_id || '').trim()
  }
  if (!resolvedEventId) {
    resolvedEventId = String(process.env.EVENT_SLUG || process.env.NEXT_PUBLIC_EVENT_SLUG || '').trim()
  }

  const fallbackTarget =
    kind === 'gl'
      ? mediaItemId
        ? `/media/${mediaItemId}`
        : resolvedEventId
          ? `/${resolvedEventId}/gallery`
          : '/gallery'
      : postId
        ? resolvedEventId
          ? `/${resolvedEventId}/blessings#post-${postId}`
          : `/blessings#post-${postId}`
        : resolvedEventId
          ? `/${resolvedEventId}/blessings`
          : '/blessings'

  let targetPath = String(body.target_path || body.targetPath || fallbackTarget).trim()
  if (!targetPath.startsWith('/')) return jsonError('target_path must start with /')

  if (kind === 'bl' && postId) {
    targetPath = resolvedEventId ? `/${resolvedEventId}/blessings#post-${postId}` : `/blessings#post-${postId}`
  }

  const payload: Record<string, any> = { code, kind, target_path: targetPath }
  if (resolvedEventId) payload.event_id = resolvedEventId
  if (postId) payload.post_id = postId
  if (mediaItemId) payload.media_item_id = mediaItemId

  const attempts: Record<string, any>[] = [
    payload,
    { code, kind, target_path: targetPath, ...(resolvedEventId ? { event_id: resolvedEventId } : {}) },
    { code, target_path: targetPath, ...(resolvedEventId ? { event_id: resolvedEventId } : {}) },
    { code, target_path: targetPath }
  ]

  let lastErr: any = null
  for (const attempt of attempts) {
    const res = await srv.from('short_links').upsert(attempt, { onConflict: 'code' })
    if (!res.error) {
      return NextResponse.json({ ok: true, kind, code, event_id: resolvedEventId || null, target_path: targetPath })
    }
    lastErr = res.error
  }

  return jsonError(lastErr?.message || 'Failed to save short link', 500)
}
