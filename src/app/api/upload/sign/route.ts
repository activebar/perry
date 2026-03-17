import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseServiceRole, getPublicUploadUrl } from '@/lib/supabase'
import { getServerEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const filename = String(body.filename || '').trim()
    const contentType = String(body.contentType || 'application/octet-stream').trim()
    const kind = String(body.kind || 'gallery').trim()
    const gallery_id = String(body.gallery_id || '').trim() || null
    const env = getServerEnv()
    const event_id = String(body.event_id || env.EVENT_SLUG || 'ido').trim().toLowerCase()

    if (!filename) return jsonError('missing filename', 400)
    if (kind === 'gallery' && !gallery_id) return jsonError('missing gallery_id', 400)

    const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/)
    const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : '.mp4'
    const kindFolder = kind === 'blessing' ? 'blessings' : kind
    const folder = kind === 'gallery' ? `${event_id}/gallery/${gallery_id}` : `${event_id}/${kindFolder}`
    const path = `${folder}/${Date.now()}_${randomUUID()}${ext}`

    const sb = supabaseServiceRole()
    const signed = await (sb.storage.from('uploads') as any).createSignedUploadUrl(path)
    if (signed.error) return jsonError(signed.error.message, 500)

    return NextResponse.json({
      ok: true,
      path,
      token: signed.data?.token || '',
      publicUrl: getPublicUploadUrl(path),
      event_id,
      contentType,
    })
  } catch (e: any) {
    return jsonError(e?.message || 'error', 500)
  }
}
