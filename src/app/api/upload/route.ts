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

    // Resolve default gallery_id if not provided
    let gallery_id: string | null = galleryFromBody
    if (!gallery_id && kind === 'gallery') {
      const g = await sb
        .from('galleries')
        .select('id')
        .eq('event_id', event_id)
        .eq('is_active', true)
        .order('order_index', { ascending: true })
        .limit(1)
        .maybeSingle()
      gallery_id = (g.data as any)?.id ? String((g.data as any).id) : null
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

      const maxDim = Math.max(0, Math.min(6000, Number((s as any)?.web_max_dimension || 0))) || 0
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
