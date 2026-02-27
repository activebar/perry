import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'
import { getEventIdFromRequest } from '@/lib/event-id'

export const dynamic = 'force-dynamic'

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function extractUploadsPathFromUrl(url: string): string {
  // Accept URLs like: .../storage/v1/object/public/uploads/<path>
  try {
    const u = new URL(url)
    const idx = u.pathname.indexOf('/uploads/')
    if (idx >= 0) return u.pathname.slice(idx + '/uploads/'.length)
  } catch {}
  const idx = url.indexOf('/uploads/')
  if (idx >= 0) return url.slice(idx + '/uploads/'.length)
  return ''
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req)
    if (!admin) return jsonError('unauthorized', 401)

    const canManage =
      admin.role === 'master' ||
      ['site.manage', 'galleries.manage', 'blessings.manage'].some((p) => !!(admin as any)?.permissions?.[p])
    if (!canManage) return jsonError('forbidden', 403)

    const eventId = String((admin as any).event_id || getEventIdFromRequest(req) || '').trim().toLowerCase()
    if (!eventId) return jsonError('missing event', 400)

    const body = await req.json().catch(() => ({} as any))
    const url = String(body?.url || '').trim()
    const urls: string[] = Array.isArray(body?.urls) ? body.urls.map((x: any) => String(x || '').trim()).filter(Boolean) : []
    const paths: string[] = Array.isArray(body?.paths) ? body.paths.map((x: any) => String(x || '').trim()).filter(Boolean) : []

    const targets = [...(url ? [url] : []), ...urls]
    if (!targets.length && !paths.length) return jsonError('missing url/urls/paths', 400)

    const sb = supabaseServiceRole()

    let deleted = 0
    // 1) delete by url via media_items (preferred, guarantees correct storage_path)
    for (const u of targets) {
      const { data: row } = await sb
        .from('media_items')
        .select('id, storage_path')
        .eq('event_id', eventId)
        .eq('url', u)
        .maybeSingle()

      const storagePath = String((row as any)?.storage_path || '').trim()
      if (storagePath) {
        try {
          await sb.storage.from('uploads').remove([storagePath])
        } catch (_) {}
        try {
          await sb.from('media_items').delete().eq('event_id', eventId).eq('id', String((row as any).id))
        } catch (_) {}
        deleted++
      } else {
        // best-effort: try to parse uploads path from URL
        const p = extractUploadsPathFromUrl(u)
        if (p) {
          await sb.storage.from('uploads').remove([p])
          deleted++
        }
      }
    }

    // 2) direct paths
    if (paths.length) {
      await sb.storage.from('uploads').remove(paths)
      deleted += paths.length
    }

    return NextResponse.json({ ok: true, deleted })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
