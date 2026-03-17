import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const kind = String(body.kind || 'gallery').trim()
    const event_id = String(body.event_id || '').trim().toLowerCase()
    const gallery_id = String(body.gallery_id || '').trim() || null
    const path = String(body.path || '').trim()
    const publicUrl = String(body.publicUrl || '').trim()
    const crop_position = String(body.crop_position || 'center').trim()
    const crop_focus_x = typeof body.crop_focus_x === 'number' ? body.crop_focus_x : null
    const crop_focus_y = typeof body.crop_focus_y === 'number' ? body.crop_focus_y : null

    if (!path || !publicUrl) return jsonError('missing upload data', 400)

    const sb = supabaseServiceRole()

    let is_approved = true
    let autoApproveUntil: string | null = null
    let requireApproval = true

    if (kind === 'gallery') {
      if (!gallery_id) return jsonError('missing gallery_id', 400)
      const { data: g, error: gerr } = await sb
        .from('galleries')
        .select('id, upload_enabled, auto_approve_until, require_approval')
        .eq('id', gallery_id)
        .maybeSingle()

      if (gerr) return jsonError(gerr.message, 500)
      if (!g) return jsonError('gallery not found', 404)
      if (!(g as any).upload_enabled) return jsonError('upload disabled', 403)

      autoApproveUntil = (g as any).auto_approve_until || null
      requireApproval = (g as any).require_approval !== false

      if (!requireApproval) {
        is_approved = false
      } else if (autoApproveUntil) {
        is_approved = Date.now() < new Date(autoApproveUntil).getTime()
      } else {
        is_approved = false
      }
    }

    const device_id = cookies().get('device_id')?.value || req.headers.get('x-device-id') || null
    const editable_until = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    const { data: inserted, error: ierr } = await sb
      .from('media_items')
      .insert({
        kind,
        event_id,
        gallery_id,
        url: publicUrl,
        thumb_url: publicUrl,
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
      .select('id, editable_until')
      .single()

    if (ierr) return jsonError(ierr.message, 500)

    return NextResponse.json({
      ok: true,
      id: inserted?.id || null,
      path,
      publicUrl,
      thumbUrl: publicUrl,
      editable_until: inserted?.editable_until || editable_until,
      is_approved,
      autoApproveUntil,
    })
  } catch (e: any) {
    return jsonError(e?.message || 'error', 500)
  }
}
