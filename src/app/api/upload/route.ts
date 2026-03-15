import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import sharp from 'sharp'
import { cookies } from 'next/headers'
import { supabaseServiceRole, getPublicUploadUrl } from '@/lib/supabase'
import { getServerEnv } from '@/lib/env'
import { getAdminFromRequest } from '@/lib/adminSession'

export const dynamic = 'force-dynamic'

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function isImageFile(file: File) {
  return (file.type || '').startsWith('image/')
}
function isVideoFile(file: File) {
  return (file.type || '').startsWith('video/')
}

function clamp01(v: unknown): number | null {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(1, n))
}

function normalizeCropPosition(v: unknown): 'top' | 'center' | 'bottom' {
  const s = String(v || '').trim().toLowerCase()
  if (s === 'top' || s === 'bottom') return s
  return 'center'
}

function deriveCropPositionFromFocusY(y: number | null, fallback: 'top' | 'center' | 'bottom') {
  if (y == null) return fallback
  if (y <= 0.34) return 'top'
  if (y >= 0.66) return 'bottom'
  return 'center'
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()

    const file = fd.get('file') as File | null
    const kind = String(fd.get('kind') || 'gallery').trim()

    const gallery_id =
      (String(fd.get('gallery_id') || '').trim() ||
        String(fd.get('galleryId') || '').trim()) || null

    if (!file) return jsonError('missing file', 400)

    const srv = getServerEnv()

    const url = new URL(req.url)
    const eventFromQuery = (url.searchParams.get('event') || '').trim().toLowerCase()
    const providedEventId = String(fd.get('event_id') || '').trim().toLowerCase()
    const legacyEvent = String(fd.get('event') || '').trim().toLowerCase()

    const referer = req.headers.get('referer') || ''
    let eventFromReferer = ''
    try {
      const u = new URL(referer)
      const seg = (u.pathname.split('/').filter(Boolean)[0] || '').trim().toLowerCase()
      if (/^[a-z0-9_-]{2,32}$/.test(seg) && seg !== 'admin') eventFromReferer = seg
    } catch {}

    let event_id = (providedEventId || legacyEvent || eventFromQuery || eventFromReferer || (srv.EVENT_SLUG || 'ido'))
      .trim()
      .toLowerCase()

    const sb = supabaseServiceRole()

    let is_approved = true
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

      const galleryEventId = String((g as any).event_id || '').trim().toLowerCase()
      if (galleryEventId) event_id = galleryEventId

      const uploadEnabled = !!(g as any).upload_enabled
      autoApproveUntil = (g as any).auto_approve_until || null
      requireApproval = (g as any).require_approval !== false

      if (!uploadEnabled) return jsonError('upload disabled', 403)

      if (!requireApproval) {
        is_approved = false
      } else if (autoApproveUntil) {
        const now = Date.now()
        const until = new Date(autoApproveUntil).getTime()
        is_approved = now < until
      } else {
        is_approved = false
      }
    }

    const ab = await file.arrayBuffer()
    const bytes = new Uint8Array(ab)

    let width: number | null = null
    let height: number | null = null
    let crop_position: 'top' | 'center' | 'bottom' = 'center'
    let crop_focus_x: number | null = null
    let crop_focus_y: number | null = null

    const isImage = isImageFile(file)
    const isVideo = isVideoFile(file)

    if (isImage) {
      try {
        const meta = await sharp(bytes).metadata()
        width = typeof meta.width === 'number' ? meta.width : null
        height = typeof meta.height === 'number' ? meta.height : null
        if (width && height && width < height) {
          crop_position = 'top'
          crop_focus_y = 0.28
          crop_focus_x = 0.5
        } else {
          crop_position = 'center'
          crop_focus_y = 0.5
          crop_focus_x = 0.5
        }
      } catch {}
    } else {
      crop_position = 'center'
      crop_focus_x = 0.5
      crop_focus_y = 0.5
    }

    const providedCropPosition = fd.get('crop_position')
    const providedFocusX = clamp01(fd.get('crop_focus_x'))
    const providedFocusY = clamp01(fd.get('crop_focus_y'))

    if (providedCropPosition != null && String(providedCropPosition).trim()) {
      crop_position = normalizeCropPosition(providedCropPosition)
    }
    if (providedFocusX != null) crop_focus_x = providedFocusX
    if (providedFocusY != null) crop_focus_y = providedFocusY

    crop_position = deriveCropPositionFromFocusY(crop_focus_y, crop_position)

    const kindFolder = kind === 'blessing' ? 'blessings' : kind

    const folder =
      kind === 'gallery'
        ? `${event_id}/gallery/${gallery_id}`
        : `${event_id}/${kindFolder}`

    const baseName = `${Date.now()}_${randomUUID()}`
    const path = isImage ? `${folder}/${baseName}.jpg` : `${folder}/${baseName}`

    let uploadBuf: Uint8Array | Buffer = bytes
    let contentType = file.type || 'application/octet-stream'

    let thumbPath: string | null = null
    let thumbBuf: Buffer | null = null

    if (isImage) {
      const fullJpg = await sharp(bytes).rotate().jpeg({ quality: 88, mozjpeg: true }).toBuffer()
      uploadBuf = fullJpg
      contentType = 'image/jpeg'

      thumbBuf = await sharp(bytes).rotate().resize(600).webp({ quality: 82 }).toBuffer()
      thumbPath = `${path}.thumb.webp`
    }

    const { error: uerr } = await sb.storage.from('uploads').upload(path, uploadBuf, {
      contentType,
      upsert: false,
    })
    if (uerr) return jsonError(uerr.message, 500)

    let thumbUrl: string | null = null
    if (thumbPath && thumbBuf) {
      const { error: terr } = await sb.storage.from('uploads').upload(thumbPath, thumbBuf, {
        contentType: 'image/webp',
        upsert: false,
      })
      if (terr) return jsonError(terr.message, 500)
      thumbUrl = getPublicUploadUrl(thumbPath)
    }

    const publicUrl = getPublicUploadUrl(path)

    const device_id =
      cookies().get('device_id')?.value ||
      String(fd.get('device_id') || '').trim() ||
      null

    const editable_until = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    const { data: inserted, error: ierr } = await sb
      .from('media_items')
      .insert({
        kind,
        event_id,
        gallery_id,
        url: publicUrl,
        thumb_url: thumbUrl || publicUrl,
        width,
        height,
        crop_position,
        crop_focus_x,
        crop_focus_y,
        storage_provider: 'supabase',
        external_url: null,
        storage_path: path,
        is_approved,
        editable_until,
        source: kind === 'gallery' ? 'gallery' : 'admin',
        uploaded_by: kind === 'gallery' ? 'guest' : 'admin',
        uploader_device_id: device_id,
      } as any)
      .select('id,editable_until,crop_position,crop_focus_x,crop_focus_y')
      .single()

    if (ierr) return jsonError(ierr.message, 500)

    return NextResponse.json({
      ok: true,
      id: (inserted as any)?.id || null,
      path,
      publicUrl,
      thumbUrl,
      editable_until: (inserted as any)?.editable_until || editable_until,
      is_approved,
      autoApproveUntil,
      crop_position: (inserted as any)?.crop_position || crop_position,
      crop_focus_x: (inserted as any)?.crop_focus_x ?? crop_focus_x,
      crop_focus_y: (inserted as any)?.crop_focus_y ?? crop_focus_y,
    })
  } catch (e: any) {
    return jsonError(e?.message || 'error', 500)
  }
}

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

    if ((item as any).deleted_at) {
      return NextResponse.json({ ok: true, alreadyDeleted: true })
    }

    const storagePath = String((item as any).storage_path || '').trim()
    if (!storagePath) {
      const { error: uerr } = await sb
        .from('media_items')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (uerr) return jsonError(uerr.message, 500)
      return NextResponse.json({ ok: true, storageDeleted: false })
    }

    const { error: derr } = await sb.storage.from('uploads').remove([storagePath, `${storagePath}.thumb.webp`])
    if (derr) return jsonError(`storage delete failed: ${derr.message}`, 500)

    const { error: uerr } = await sb
      .from('media_items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (uerr) return jsonError(uerr.message, 500)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return jsonError(e?.message || 'error', 500)
  }
}
