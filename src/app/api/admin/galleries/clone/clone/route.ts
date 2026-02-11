import { NextResponse } from 'next/server'
import { getAdminFromRequest, requireAnyPermission } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'
import { getEventId } from '@/lib/event-id'

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// Clone/Create a new gallery + corresponding gallery block.
// This is the recommended way to add more galleries without writing SQL.
export async function POST(req: Request) {
  const admin = await getAdminFromRequest(req as any)
  if (!admin) return jsonError('unauthorized', 401)
  try {
    requireAnyPermission(admin, ['galleries.manage', 'site.manage'])
  } catch {
    return jsonError('forbidden', 403)
  }

  const body = await req.json().catch(() => ({}))
  const sourceGalleryId = String(body.source_gallery_id || '').trim() || null

  const sb = supabaseServiceRole()
  const eventId = admin.event_id || getEventId()

  // Determine next gallery block type: gallery_{N+1}
  const { data: blocks } = await sb
    .from('blocks')
    .select('id, type, order_index')
    .eq('event_id', eventId)
    .order('order_index', { ascending: true })

  const gallerySuffixes = (blocks || [])
    .map((b: any) => String(b.type || ''))
    .filter((t: string) => t.startsWith('gallery_'))
    .map((t: string) => Number(t.replace('gallery_', '')))
    .filter((n: number) => Number.isFinite(n) && n > 0)

  const nextN = (gallerySuffixes.length ? Math.max(...gallerySuffixes) : 0) + 1
  const nextType = `gallery_${nextN}`
  const nextOrder = (blocks || []).reduce((m: number, b: any) => Math.max(m, Number(b.order_index || 0)), 0) + 1

  // Load source gallery (optional)
  let source: any = null
  if (sourceGalleryId) {
    const { data: g } = await sb
      .from('galleries')
      .select('*')
      .eq('event_id', eventId)
      .eq('id', sourceGalleryId)
      .maybeSingle()
    source = g
  }

  // Create gallery row
  const title = String(source?.title || `גלריה ${nextN}`)
  const upload_default_hours = Number(source?.upload_default_hours || 8)
  const require_approval = source?.require_approval !== undefined ? !!source.require_approval : true

  const { data: newGallery, error: gErr } = await sb
    .from('galleries')
    .insert({
      event_id: eventId,
      title,
      order_index: nextN,
      upload_enabled: false,
      auto_approve_until: null,
      upload_default_hours,
      require_approval
    } as any)
    .select('*')
    .single()
  if (gErr) return jsonError(gErr.message, 500)

  // Create matching block
  const { data: newBlock, error: bErr } = await sb
    .from('blocks')
    .insert({
      event_id: eventId,
      type: nextType,
      order_index: nextOrder,
      is_visible: true,
      title,
      config: {
        gallery_id: newGallery.id,
        title,
        button_label: 'לכל התמונות',
        limit: 12
      }
    } as any)
    .select('*')
    .single()
  if (bErr) return jsonError(bErr.message, 500)

  return NextResponse.json({ ok: true, gallery: newGallery, block: newBlock })
}
