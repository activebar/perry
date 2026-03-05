import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseServiceRole, getPublicUploadUrl } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()

    const file = form.get('file') as File | null
    const event = String(form.get('event') || '').trim()
    const kind = String(form.get('kind') || '').trim() // hero | gallery | blessing
    const galleryId = (form.get('gallery_id') ? String(form.get('gallery_id')) : '').trim()
    const deviceId = String(form.get('device_id') || '').trim() || null

    if (!file || !event || !kind) return jsonError('missing fields', 400)
    if (kind === 'gallery' && !galleryId) return jsonError('missing gallery_id', 400)

    const ab = await file.arrayBuffer()
    const input = Buffer.from(ab)

    // Read metadata for width/height
    const meta = await sharp(input).metadata().catch(() => null as any)
    const width = typeof meta?.width === 'number' ? meta.width : null
    const height = typeof meta?.height === 'number' ? meta.height : null

    const isImage = /^image\//.test(file.type || '') || /\.(jpe?g|png|webp|heic)$/i.test(file.name || '')
    if (!isImage) return jsonError('unsupported file', 415)

    // Full JPG
    const fullBuf = await sharp(input)
      .rotate()
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer()

    // Thumb WEBP (for fast grids/previews)
    const thumbBuf = await sharp(input)
      .rotate()
      .resize(600)
      .webp({ quality: 82 })
      .toBuffer()

    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`

    // Storage path conventions (singular "blessing")
    let path = ''
    if (kind === 'hero') path = `${event}/hero/${filename}`
    else if (kind === 'blessing') path = `${event}/blessing/${filename}`
    else if (kind === 'gallery') path = `${event}/gallery/${galleryId}/${filename}`
    else return jsonError('bad kind', 400)

    const thumbPath = `${path}.thumb.webp`

    const sb = supabaseServiceRole()

    const up1 = await sb.storage.from('uploads').upload(path, fullBuf, {
      contentType: 'image/jpeg',
      upsert: false
    })
    if (up1.error) return jsonError(up1.error.message, 500)

    const up2 = await sb.storage.from('uploads').upload(thumbPath, thumbBuf, {
      contentType: 'image/webp',
      upsert: false
    })
    if (up2.error) {
      // best-effort rollback original
      await sb.storage.from('uploads').remove([path]).catch(() => null as any)
      return jsonError(up2.error.message, 500)
    }

    const publicUrl = getPublicUploadUrl(path)
    const thumbUrl = getPublicUploadUrl(thumbPath)

    // Editable window: 1 hour for gallery uploads (device-based)
    const editableUntil =
      kind === 'gallery' ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : null

    const ins = await sb
      .from('media_items')
      .insert({
        event_id: event,
        kind,
        gallery_id: kind === 'gallery' ? galleryId : null,
        storage_path: path,
        public_url: publicUrl,
        url: publicUrl,
        thumb_url: thumbUrl,
        width,
        height,
        mime_type: 'image/jpeg',
        uploader_device_id: deviceId,
        editable_until: editableUntil,
        is_approved: true
      })
      .select('id, public_url, thumb_url, created_at, editable_until, uploader_device_id, crop_position')
      .single()

    if (ins.error) {
      // rollback storage
      await sb.storage.from('uploads').remove([path, thumbPath]).catch(() => null as any)
      return jsonError(ins.error.message, 500)
    }

    return NextResponse.json({
      ok: true,
      item: {
        id: ins.data.id,
        url: ins.data.public_url || publicUrl,
        thumb_url: ins.data.thumb_url || thumbUrl,
        created_at: ins.data.created_at,
        editable_until: ins.data.editable_until,
        uploader_device_id: ins.data.uploader_device_id,
        crop_position: ins.data.crop_position ?? null
      }
    })
  } catch (e) {
    console.error(e)
    return jsonError('upload failed', 500)
  }
}
