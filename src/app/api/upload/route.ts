import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import sharp from 'sharp'
import { supabaseServiceRole, getPublicUploadUrl } from '@/lib/supabase'
import { getServerEnv } from '@/lib/env'
import { getEventId } from '@/lib/event-id'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    const kind = String(fd.get('kind') || 'gallery')
    const event_id = getEventId()
    const galleryFromBody = String(fd.get('gallery_id') || '').trim() || null
    if (!file) return NextResponse.json({ error: 'missing file' }, { status: 400 })

    const sb = supabaseServiceRole()

    // For gallery uploads we require an explicit gallery_id (no implicit defaults)
    let gallery_id: string | null = galleryFromBody
    let galleryRow: any = null

    if (kind === 'gallery') {
      if (!gallery_id) return NextResponse.json({ error: 'missing gallery_id' }, { status: 400 })

  const { data: gRow, error: gErr } = await sb
    .from('galleries')
    .select('id, upload_enabled, web_max_dimension, is_active')
    .eq('event_id', event_id)
    .eq('id', gallery_id)
    .maybeSingle()

      if (gErr) throw gErr
      galleryRow = gRow
      if (!gRow || gRow.is_active === false) return NextResponse.json({ error: 'gallery not found' }, { status: 404 })
      if (gRow.upload_enabled === false) return NextResponse.json({ error: 'upload disabled for this gallery' }, { status: 403 })
    }

    // NOTE: In newer @types/node, Buffer is generic (Buffer<T extends ArrayBufferLike>).
    // Keep this typed as plain `Buffer` to avoid build-time incompatibilities between
    // Buffer<ArrayBuffer> and Buffer<ArrayBufferLike> across different typings.
    let buf: Buffer = Buffer.from(await file.arrayBuffer())

    // WEB_ONLY resizing for images (max dimension controlled in event_settings.web_max_dimension)
    let contentType = file.type || 'application/octet-stream'
    let ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'

    if (contentType.startsWith('image/')) {
      const { data: s } = await sb
        .from('event_settings')
        .select('web_max_dimension')
        .eq('event_id', event_id)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const maxDim = Math.max(0, Math.min(6000, Number((kind === 'gallery' ? (galleryRow as any)?.web_max_dimension : null) ?? (s as any)?.web_max_dimension ?? 0))) || 0
      if (maxDim > 0) {
        buf = await sharp(buf)
          .rotate()
          .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 82, mozjpeg: true })
          .toBuffer()
        contentType = 'image/jpeg'
        ext = 'jpg'
      }
    }
    const srv = getServerEnv()
    const path = `${srv.EVENT_SLUG}/${kind}/${Date.now()}_${randomUUID()}.${ext}`
    const { error } = await sb.storage.from('uploads').upload(path, buf, {
      contentType,
      upsert: false
    })
    if (error) throw error

    const publicUrl = getPublicUploadUrl(path)
    const { data: inserted, error: insErr } = await sb
      .from('media_items')
      .insert({
        event_id,
        kind,
        gallery_id,
        storage_path: path,
        public_url: publicUrl,
        mime_type: contentType || null
      })
      .select('id')
      .single()
    if (insErr) throw insErr

    return NextResponse.json({ ok: true, id: (inserted as any)?.id, path, publicUrl, mime_type: contentType })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}