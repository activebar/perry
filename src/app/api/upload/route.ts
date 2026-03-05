import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function safeStr(v: any) {
  return String(v || '').trim()
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()

    const file = form.get('file') as File
    const kind = safeStr(form.get('kind'))

    // support both: event and event_id
    const event = safeStr(form.get('event')) || safeStr(form.get('event_id'))
    const galleryId = safeStr(form.get('gallery_id')) || safeStr(form.get('galleryId'))
    const uploaderDeviceId = safeStr(form.get('uploader_device_id')) || safeStr(form.get('uploaderDeviceId'))

    if (!file || !event || !kind) {
      return NextResponse.json({ error: 'missing fields' }, { status: 400 })
    }

    if (kind === 'gallery' && !galleryId) {
      return NextResponse.json({ error: 'missing gallery_id' }, { status: 400 })
    }

    const ab = await file.arrayBuffer()
    const input = new Uint8Array(ab)

    const isImage = /^image\//.test(file.type || '')
    if (!isImage) {
      return NextResponse.json({ error: 'unsupported file type' }, { status: 400 })
    }

    // Full JPG
    const fullBuf = await sharp(input)
      .rotate()
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer()

    // Thumb WEBP
    const thumbBuf = await sharp(input)
      .rotate()
      .resize(700)
      .webp({ quality: 82 })
      .toBuffer()

    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`

    let path = ''
    if (kind === 'hero') path = `${event}/hero/${filename}`
    else if (kind === 'blessing') path = `${event}/blessings/${filename}`
    else if (kind === 'gallery') path = `${event}/gallery/${galleryId}/${filename}`
    else path = `${event}/misc/${filename}`

    const thumbPath = `${path}.thumb.webp`

    const sb = supabaseServiceRole()

    const up1 = await sb.storage.from('uploads').upload(path, fullBuf, {
      contentType: 'image/jpeg',
      upsert: false
    })
    if (up1.error) return NextResponse.json({ error: up1.error.message }, { status: 500 })

    const up2 = await sb.storage.from('uploads').upload(thumbPath, thumbBuf, {
      contentType: 'image/webp',
      upsert: false
    })
    if (up2.error) return NextResponse.json({ error: up2.error.message }, { status: 500 })

    const publicUrl = sb.storage.from('uploads').getPublicUrl(path).data.publicUrl
    const thumbUrl = sb.storage.from('uploads').getPublicUrl(thumbPath).data.publicUrl

    const editable_until = kind === 'gallery' ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : null

    const ins = await sb.from('media_items').insert({
      event_id: event,
      kind,
      gallery_id: kind === 'gallery' ? galleryId : null,
      storage_path: path,
      // keep both columns for backward compatibility
      url: publicUrl,
      public_url: publicUrl,
      thumb_url: thumbUrl,
      uploader_device_id: uploaderDeviceId || null,
      editable_until,
      is_approved: true
    }).select('id,storage_path,public_url,thumb_url,editable_until,is_approved').single()

    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      id: ins.data.id,
      mediaItemId: ins.data.id,
      path: ins.data.storage_path,
      publicUrl: ins.data.public_url || publicUrl,
      thumbUrl: ins.data.thumb_url || thumbUrl,
      editable_until: ins.data.editable_until,
      is_approved: ins.data.is_approved
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e?.message || 'upload failed' }, { status: 500 })
  }
}
