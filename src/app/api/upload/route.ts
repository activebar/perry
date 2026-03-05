import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { cookies } from 'next/headers'
import { supabaseServiceRole, getPublicUploadUrl } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function pickFirst(...vals: Array<any>): string {
  for (const v of vals) {
    const s = typeof v === 'string' ? v : (v == null ? '' : String(v))
    const t = s.trim()
    if (t) return t
  }
  return ''
}

function inferEventFromReferer(referer: string | null): string {
  try {
    if (!referer) return ''
    const u = new URL(referer)
    // admin?event=demo
    const spEvent = u.searchParams.get('event') || u.searchParams.get('event_id')
    if (spEvent) return String(spEvent)
    // /{event}/...
    const parts = u.pathname.split('/').filter(Boolean)
    return parts?.[0] ? String(parts[0]).trim() : ''
  } catch {
    return ''
  }
}

function deriveThumbCandidates(basePath: string): string[] {
  const out = new Set<string>()
  // current convention: original.ext.thumb.webp
  out.add(`${basePath}.thumb.webp`)
  // fallback convention: original.thumb.webp
  const stripped = basePath.replace(/\.[^./]+$/, '')
  if (stripped && stripped !== basePath) out.add(`${stripped}.thumb.webp`)
  return Array.from(out)
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()

    const file = form.get('file') as File | null
    const kind = pickFirst(form.get('kind'))

    // We accept multiple field names to stay compatible across versions.
    const event = pickFirst(
      form.get('event'),
      form.get('event_id'),
      form.get('eventId'),
      inferEventFromReferer(req.headers.get('referer'))
    )

    const galleryId = pickFirst(form.get('gallery_id'), form.get('galleryId')) || null

    if (!file || !event || !kind) {
      return NextResponse.json(
        {
          error: 'missing fields',
          debug: {
            hasFile: !!file,
            event,
            kind,
            galleryId,
          },
        },
        { status: 400 }
      )
    }

    // For gallery uploads, we must have a gallery_id
    if (kind === 'gallery' && !galleryId) {
      return NextResponse.json({ error: 'missing gallery_id' }, { status: 400 })
    }

    const deviceId = cookies().get('device_id')?.value || null

    const ab = await file.arrayBuffer()
    const input = new Uint8Array(ab)

    const fullBuf = await sharp(input)
      .rotate()
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer()

    const thumbBuf = await sharp(input)
      .rotate()
      .resize(600)
      .webp({ quality: 82 })
      .toBuffer()

    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`

    // Storage path (ALWAYS plural blessings)
    let path = ''
    if (kind === 'hero') path = `${event}/hero/${filename}`
    else if (kind === 'blessing') path = `${event}/blessings/${filename}`
    else if (kind === 'gallery') path = `${event}/gallery/${galleryId}/${filename}`
    else path = `${event}/${kind}/${filename}`

    const thumbPath = `${path}.thumb.webp`

    const sb = supabaseServiceRole()

    // Upload both files
    const up1 = await sb.storage.from('uploads').upload(path, fullBuf, {
      contentType: 'image/jpeg',
      upsert: false,
    })
    if (up1.error) return NextResponse.json({ error: up1.error.message }, { status: 500 })

    const up2 = await sb.storage.from('uploads').upload(thumbPath, thumbBuf, {
      contentType: 'image/webp',
      upsert: false,
    })
    if (up2.error) {
      // best-effort rollback original
      await sb.storage.from('uploads').remove([path]).catch(() => null as any)
      return NextResponse.json({ error: up2.error.message }, { status: 500 })
    }

    const publicUrl = getPublicUploadUrl(path)
    const thumbUrl = getPublicUploadUrl(thumbPath)

    // Gallery items are editable for 1 hour by uploader's device
    const editable_until =
      kind === 'gallery' ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : null

    const ins = await sb
      .from('media_items')
      .insert({
        event_id: event,
        kind,
        gallery_id: galleryId,
        storage_path: path,
        // keep both columns to support older code paths
        url: publicUrl,
        public_url: publicUrl,
        thumb_url: thumbUrl,
        is_approved: true,
        editable_until,
        uploader_device_id: deviceId,
      })
      .select('id, is_approved')
      .single()

    if (ins.error) {
      // rollback storage best-effort
      await sb.storage.from('uploads').remove([path, thumbPath]).catch(() => null as any)
      return NextResponse.json({ error: ins.error.message }, { status: 500 })
    }

    const id = (ins.data as any)?.id || ''
    const is_approved = !!(ins.data as any)?.is_approved

    return NextResponse.json({
      ok: true,
      id,
      path,
      publicUrl,
      thumbUrl,
      is_approved,
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e?.message || 'upload failed' }, { status: 500 })
  }
}

// Optional: allow client-side delete for "my upload" within 1 hour (gallery only)
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const id = pickFirst(body?.id)
    if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

    const deviceId = cookies().get('device_id')?.value || null
    if (!deviceId) return NextResponse.json({ error: 'missing device_id' }, { status: 400 })

    const sb = supabaseServiceRole()
    const { data: row, error: rerr } = await sb
      .from('media_items')
      .select('id, kind, storage_path, url, thumb_url, editable_until, uploader_device_id')
      .eq('id', id)
      .single()
    if (rerr) return NextResponse.json({ error: rerr.message }, { status: 500 })
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })

    if ((row as any).kind !== 'gallery') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    if ((row as any).uploader_device_id !== deviceId) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const until = (row as any).editable_until ? new Date((row as any).editable_until).getTime() : 0
    if (!until || Date.now() > until) {
      return NextResponse.json({ error: 'אפשר למחוק/לערוך רק בשעה הראשונה.' }, { status: 403 })
    }

    const base = String((row as any).storage_path || '').trim()
    const paths = new Set<string>()
    if (base) {
      paths.add(base)
      for (const t of deriveThumbCandidates(base)) paths.add(t)
    }
    await sb.storage.from('uploads').remove(Array.from(paths)).catch(() => null as any)
    await sb.from('media_items').delete().eq('id', id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
