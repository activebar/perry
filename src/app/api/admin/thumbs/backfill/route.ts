import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole, getPublicUploadUrl } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function isLikelyImage(path: string | null | undefined) {
  if (!path) return false
  const p = path.toLowerCase()
  return p.endsWith('.jpg') || p.endsWith('.jpeg') || p.endsWith('.png') || p.endsWith('.webp')
}

/**
 * Backfill thumbnails for existing media_items rows.
 * Usage (admin only):
 * POST /api/admin/thumbs/backfill?event=ido&limit=50
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (admin.role !== 'master') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const url = new URL(req.url)
    const event = url.searchParams.get('event') || (admin as any).event_id || null
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 200)

    const sb = supabaseServiceRole()

    let q = sb
      .from('media_items')
      .select('id, event_id, storage_path, url, thumb_url')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (event) q = q.eq('event_id', event)

    // backfill rows where thumb_url is missing OR not a real thumb (doesn't end with .thumb.webp)
    q = q.or('thumb_url.is.null,thumb_url.not.like.%.thumb.webp')
const { data: rows, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    let processed = 0
    let updated = 0

    for (const r of rows || []) {
      processed++
      const storagePath = (r as any).storage_path as string | null
      if (!storagePath || !isLikelyImage(storagePath)) continue

      const thumbPath = `${storagePath}.thumb.webp`

      try {
        const dl = await sb.storage.from('uploads').download(storagePath)
        if (dl.error || !dl.data) continue

        const buf = Buffer.from(await (dl.data as any).arrayBuffer())
        const thumbBuf = await sharp(buf)
          .rotate()
          .resize({ width: 900, withoutEnlargement: true })
          .webp({ quality: 70 })
          .toBuffer()

        const up = await sb.storage.from('uploads').upload(thumbPath, thumbBuf, {
          contentType: 'image/webp',
          upsert: true,
          cacheControl: '31536000',
        })
        if (up.error) continue

        const thumbUrl = getPublicUploadUrl(thumbPath)
        const { error: upErr } = await sb
          .from('media_items')
          .update({ thumb_url: thumbUrl })
          .eq('id', (r as any).id)
          .eq('event_id', (r as any).event_id)

        if (!upErr) updated++
      } catch {
        // ignore row
      }
    }

    return NextResponse.json({ ok: true, processed, updated, event, limit })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
