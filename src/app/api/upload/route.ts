import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import sharp from 'sharp'
import { cookies } from 'next/headers'
import { supabaseServiceRole, getPublicUploadUrl } from '@/lib/supabase'
import { getServerEnv } from '@/lib/env'
import { getAdminFromRequest } from '@/lib/adminSession'

export const dynamic = 'force-dynamic'

// We intentionally generate TWO files for image uploads:
// 1) original.jpg (full quality for lightbox/full view)
// 2) original.jpg.thumb.webp (small, fast grid/preview)
// Required for HERO / Gallery / Blessings.

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

/**
 * Upload endpoint for client-side compressed images.
 * Supports kind=gallery (per-gallery upload) and kind=hero/og/blessing etc.
 *
 * For gallery uploads:
 * - requires gallery_id
 * - requires galleries.upload_enabled = true
 * - auto-approves while now < galleries.auto_approve_until (if require_approval=true)
 * - after window ends, uploads are allowed but go to pending (is_approved=false)
 */
export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    const kind = String(fd.get('kind') || 'gallery')
    const gallery_id = String(fd.get('gallery_id') || '').trim() || null

    if (!file) return jsonError('missing file', 400)

    const srv = getServerEnv()

    // Resolve event_id robustly:
    // 1) formData event_id (admin should send it)
    // 2) query param ?event=
    // 3) Referer query ?event= (admin pages use /admin?event=demo)
    // 4) Referer path prefix /{event}/... (only if not 'admin')
    // 5) server ENV fallback
    const url = new URL(req.url)
    const eventFromQuery = (url.searchParams.get('event') || '').trim().toLowerCase()
    const providedEventId = String(fd.get('event_id') || '').trim().toLowerCase()

    const referer = req.headers.get('referer') || ''
    let eventFromReferer = ''
    let eventFromRefererQuery = ''
    try {
      const u = new URL(referer)
      // prefer ?event= on admin pages
      eventFromRefererQuery = (u.searchParams.get('event') || '').trim().toLowerCase()

      const seg = (u.pathname.split('/').filter(Boolean)[0] || '').trim().toLowerCase()
      // only accept simple slugs (avoid weird paths) and NEVER accept 'admin' as an event
      if (seg && seg !== 'admin' && /^[a-z0-9_-]{2,32}$/.test(seg)) eventFromReferer = seg
    } catch {
      // ignore
    }

    let event_id = (providedEventId || eventFromQuery || eventFromRefererQuery || eventFromReferer || (srv.EVENT_SLUG || 'ido'))
      .trim()
      .toLowerCase()

    const sb = supabaseServiceRole()

    // Gallery permission + approval logic
    let is_approved = true
    let uploadEnabled = true
    let autoApproveUntil: string | null = null
    let requireApproval: boolean = true

    if (kind === 'gallery') {
      if (!gallery_id) return jsonError('missing gallery_id', 400)

      const { data: g, error: gerr } = await sb
        .from('galleries')
        .select('id, event_id, upload_enabled, auto_approve_until, require_approval')
        .eq('id', gallery_id)
        .maybeSingle()

      if (gerr) return jsonError(gerr.message, 500)
      if (!g) return jsonError('gallery not found', 404)

      // Always trust the gallery's event_id for storage + row scoping
      const galleryEventId = String((g as any).event_id || '').trim().toLowerCase()
      if (galleryEventId) event_id = galleryEventId

      uploadEnabled = !!(g as any).upload_enabled
      autoApproveUntil = (g as any).auto_approve_until || null
      requireApproval = (g as any).require_approval !== false

      if (!uploadEnabled) return jsonError('upload disabled', 403)

      // If requireApproval is disabled => always require approval (no auto-approve)
      if (!requireApproval) {
        is_approved = false
      } else if (autoApproveUntil) {
        const now = Date.now()
        const until = new Date(autoApproveUntil).getTime()
        is_approved = now < until
      } else {
        // No window => require approval by default
        is_approved = false
      }
    }

    const ab = await file.arrayBuffer()
    const inputBuf = Buffer.from(new Uint8Array(ab))

    // Extract basic image metadata (for smart cropping defaults)
    const isImage = (file.type || '').startsWith('image/')
    let width: number | null = null
    let height: number | null = null
    let crop_position: 'top' | 'center' = 'center'

    if (isImage) {
      try {
        const meta = await sharp(inputBuf).metadata()
        width = typeof meta.width === 'number' ? meta.width : null
        height = typeof meta.height === 'number' ? meta.height : null
        if (width && height && width < height) crop_position = 'top'
      } catch {
        // ignore metadata failures
      }
    }

    // Always normalize images to JPG for the "full" asset.
    // Thumb is WEBP.
    const isSupportedImage = isImage
    const fullExt = isSupportedImage ? 'jpg' : ((file.name.includes('.') ? file.name.split('.').pop() : '') || 'bin')
    const safeExt = String(fullExt).toLowerCase().replace(/[^a-z0-9]/g, '') || (isSupportedImage ? 'jpg' : 'bin')

    // Folder mapping to keep storage consistent across the whole platform
    const normKind = kind.toLowerCase()
    const kindFolder =
      normKind === 'gallery' || normKind === 'galleries'
        ? 'gallery'
        : normKind === 'blessing' || normKind === 'blessings'
          ? 'blessings'
          : normKind === 'hero'
            ? 'hero'
            : normKind

    const folder =
      normKind === 'gallery' || normKind === 'galleries'
        ? `${event_id}/gallery/${gallery_id}`
        : `${event_id}/${kindFolder}`

    const baseName = `${Date.now()}_${randomUUID()}`
    const path = `${folder}/${baseName}.${safeExt}`
    const thumbPath = `${path}.thumb.webp`

    // Build buffers
    let fullBuf = inputBuf
    let fullContentType = file.type || 'application/octet-stream'
    let thumbBuf: Buffer | null = null
    if (isSupportedImage) {
      // Full JPG
      fullBuf = await sharp(inputBuf)
        .rotate()
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer()
      fullContentType = 'image/jpeg'

      // Thumb WEBP (fast preview)
      // HERO needs a larger preview than gallery cards.
      const thumbMax = normKind === 'hero' ? 1600 : 720
      thumbBuf = await sharp(fullBuf)
        .rotate()
        .resize({ width: thumbMax, height: thumbMax, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer()
    }

    // Upload full
    const { error: fullErr } = await sb.storage.from('uploads').upload(path, fullBuf, {
      contentType: fullContentType,
      upsert: false
    })
    if (fullErr) return jsonError(fullErr.message, 500)

    // Upload thumb (best-effort)
    if (thumbBuf) {
      const { error: tErr } = await sb.storage.from('uploads').upload(thumbPath, thumbBuf, {
        contentType: 'image/webp',
        upsert: false
      })
      if (tErr) thumbBuf = null
    }

    const publicUrl = getPublicUploadUrl(path)
    const thumbUrl = thumbBuf ? getPublicUploadUrl(thumbPath) : publicUrl

    const device_id = cookies().get('device_id')?.value || null
    const editable_until = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    const { error: ierr } = await sb.from('media_items').insert({
      kind,
      event_id,
      gallery_id,
      url: publicUrl,
      thumb_url: thumbUrl,
      width,
      height,
      crop_position: isImage ? crop_position : 'center',
      storage_provider: 'supabase',
      external_url: null,
      storage_path: path,
      is_approved,
      editable_until,
      source: kind === 'gallery' ? 'gallery' : 'admin',
      uploaded_by: kind === 'gallery' ? 'guest' : 'admin',
      uploader_device_id: device_id
    } as any)

    if (ierr) return jsonError(ierr.message, 500)

    return NextResponse.json({ ok: true, path, publicUrl, thumbUrl, is_approved, autoApproveUntil })
  } catch (e: any) {
    return jsonError(e?.message || 'error', 500)
  }
}

/**
 * Delete media item:
 * - Admin only
 * - Deletes the underlying file from Storage (uploads bucket) using storage_path
 * - Soft-deletes the DB row (deleted_at)
 *
 * Body: { id: "<media_items.id>" }
 */
export async function DELETE(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req)
    if (!admin) return jsonError('Unauthorized', 401)

    const body = await req.json().catch(() => ({} as any))
    const id = String(body?.id || '').trim()
    if (!id) return jsonError('missing id', 400)

    const sb = supabaseServiceRole()

    const { data: item, error: rerr } = await sb
      .from('media_items')
      .select('id, storage_path, deleted_at')
      .eq('id', id)
      .maybeSingle()

    if (rerr) return jsonError(rerr.message, 500)
    if (!item) return jsonError('not found', 404)

    // already deleted => idempotent
    if ((item as any).deleted_at) {
      return NextResponse.json({ ok: true, alreadyDeleted: true })
    }

    const storagePath = String((item as any).storage_path || '').trim()
    if (!storagePath) {
      // If no storage_path, still mark deleted to hide it
      const { error: uerr } = await sb
        .from('media_items')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (uerr) return jsonError(uerr.message, 500)
      return NextResponse.json({ ok: true, storageDeleted: false })
    }

    // Remove from storage first
    const { error: derr } = await sb.storage.from('uploads').remove([storagePath, `${storagePath}.thumb.webp`])
    if (derr) {
      // If storage delete fails, do not mark deleted_at (so we don't lose trace)
      return jsonError(`storage delete failed: ${derr.message}`, 500)
    }

    // Mark deleted in DB
    const { error: uerr } = await sb
      .from('media_items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (uerr) return jsonError(uerr.message, 500)

    return NextResponse.json({ ok: true, storageDeleted: true })
  } catch (e: any) {
    return jsonError(e?.message || 'error', 500)
  }
}