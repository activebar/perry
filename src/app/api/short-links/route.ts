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
  const eventId = String(body.event_id || body.eventId || '').trim() || (process.env.EVENT_SLUG || process.env.NEXT_PUBLIC_EVENT_SLUG || '')

  if (postId && mediaItemId) return jsonError('Provide either post_id or media_item_id, not both')

  const fallbackTarget =
    kind === 'gl'
      ? mediaItemId
        ? `/media/${mediaItemId}`
        : postId
          ? `/gallery/p/${postId}`
          : '/gallery'
      : postId
        ? `/blessings/p/${postId}`
        : '/blessings'

  const code = cleanCode(body.code || (postId ? postId.slice(0, 8) : mediaItemId ? mediaItemId.slice(0, 8) : ''))
  if (!/^[0-9a-f]{6,16}$/.test(code)) return jsonError('Invalid code format')

  const targetPath = String(body.target_path || body.targetPath || fallbackTarget).trim()
  if (!targetPath.startsWith('/')) return jsonError('target_path must start with /')

  const srv = supabaseServiceRole()

  // Try schemas in this order:
  // (1) code + kind + post_id/media_item_id + target_path (+event_id if exists)
  // (2) code + kind + target_path
  // (3) code + post_id + target_path (legacy)
  // (4) code + target_path (legacy)
  const attempts: any[] = []
  if (postId) attempts.push({ code, kind, post_id: postId, target_path: targetPath, event_id: eventId || undefined })
  if (mediaItemId) attempts.push({ code, kind, media_item_id: mediaItemId, target_path: targetPath, event_id: eventId || undefined })
  attempts.push({ code, kind, target_path: targetPath, event_id: eventId || undefined })
  if (postId) attempts.push({ code, post_id: postId, target_path: targetPath, event_id: eventId || undefined })
  attempts.push({ code, target_path: targetPath })

  let lastErr: any = null
  for (const payload of attempts) {
    const res = await srv.from('short_links').upsert(payload, { onConflict: 'code' })
    if (!res.error) return NextResponse.json({ ok: true, kind, code, target_path: targetPath })
    lastErr = res.error
  }

  return jsonError(lastErr?.message || 'Failed to save short link', 500)
}
