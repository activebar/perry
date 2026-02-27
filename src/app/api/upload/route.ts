import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import sharp from 'sharp'
import { cookies } from 'next/headers'
import { supabaseServiceRole, getPublicUploadUrl } from '@/lib/supabase'
import { getServerEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

/**
 * Upload endpoint for client-side compressed images.
 * Supports kind=gallery (per-gallery upload) and kind=hero/og etc.
 *
 * For gallery uploads:
 * - requires gallery_id
 * - requires galleries.upload_enabled = true
 * - auto-approves while now < galleries.auto_approve_until
 * - after window ends, uploads are allowed but go to pending (is_approved=false)
 */
export async function POST(req: Request) {
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    const kind = String(fd.get('kind') || 'gallery')
    const gallery_id = String(fd.get('gallery_id') || '').trim() || null

    if (!file) return jsonError('missing file', 400)

    const srv = getServerEnv()
    const event_id = (srv.EVENT_SLUG || 'ido').trim().toLowerCase()

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
        .select('id, upload_enabled, auto_approve_until, require_approval')
        .eq('id', gallery_id)
        .maybeSingle()

      if (gerr) return jsonError(gerr.message, 500)
      if (!g) return jsonError('gallery not found', 404)

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

    const buf = Buffer.from(await file.arrayBuffer())

// Extract basic image metadata (for smart cropping defaults)
const isImage = (file.type || '').startsWith('image/')
let width: number | null = null
let height: number | null = null
let crop_position: 'top' | 'center' = 'center'

if (isImage) {
  try {
    const meta = await sharp(buf).metadata()
    width = typeof meta.width === 'number' ? meta.width : null
    height = typeof meta.height === 'number' ? meta.height : null
    if (width && height && width < height) crop_position = 'top'
  } catch {
    // ignore metadata failures
  }
}

    const ext = (file.name.includes('.') ? file.name.split('.').pop() : '') || 'jpg'
    const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'

    const folder =
      kind === 'gallery'
        ? `${event_id}/gallery/${gallery_id}`
        : `${event_id}/${kind}`

    const path = `${folder}/${Date.now()}_${randomUUID()}.${safeExt}`

    const { error } = await sb.storage.from('uploads').upload(path, buf, {
      contentType: file.type || 'application/octet-stream',
      upsert: false
    })
    if (error) return jsonError(error.message, 500)

    const publicUrl = getPublicUploadUrl(path)

    const device_id = cookies().get('device_id')?.value || null
    const editable_until = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    const { error: ierr } = await sb.from('media_items').insert({
      kind,
      event_id,
      gallery_id,
      url: publicUrl,
      thumb_url: publicUrl,
      width,
      height,
      crop_position: isImage ? crop_position : 'center',
      storage_provider: 'supabase',
      external_url: null,
      storage_path: path,
      is_approved,
      editable_until,
      source: 'gallery',
      uploaded_by: 'guest',
      uploader_device_id: device_id
    } as any)

    if (ierr) return jsonError(ierr.message, 500)

    return NextResponse.json({ ok: true, path, publicUrl, is_approved, autoApproveUntil })
  } catch (e: any) {
    return jsonError(e?.message || 'error', 500)
  }
}
