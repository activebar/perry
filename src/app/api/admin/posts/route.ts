import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'
import { getEventIdFromRequest } from '@/lib/event-id'

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('unauthorized', 401)
  const sp = req.nextUrl.searchParams
  const status = String(sp.get('status') || '').trim()
  const kind = String(sp.get('kind') || '').trim()
  const sb = supabaseServiceRole()
  let q = sb.from('posts').select('*').eq('event_id', (admin as any).event_id || getEventIdFromRequest(req)).order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  if (kind) q = q.eq('kind', kind)
  const { data, error } = await q
  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ ok: true, posts: data || [] })
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('unauthorized', 401)
  const body = await req.json().catch(() => ({}))
  const id = String(body.id || '').trim()
  if (!id) return jsonError('missing id', 400)
  const sb = supabaseServiceRole()
  const patch: Record<string, any> = {}
  for (const key of ['author_name','text','link_url','media_url','media_path','video_url','status']) {
    if (key in body) patch[key] = body[key] ?? null
  }
  const { data, error } = await sb.from('posts').update(patch).eq('event_id', (admin as any).event_id || getEventIdFromRequest(req)).eq('id', id).select('*').single()
  if (error) return jsonError(error.message, 500)
  if ('crop_position' in body || 'crop_focus_x' in body || 'crop_focus_y' in body) {
    const cropPatch: Record<string, any> = {}
    if ('crop_position' in body) cropPatch.crop_position = body.crop_position
    if ('crop_focus_x' in body) cropPatch.crop_focus_x = body.crop_focus_x
    if ('crop_focus_y' in body) cropPatch.crop_focus_y = body.crop_focus_y
    await sb.from('media_items').update(cropPatch).eq('post_id', id)
  }
  return NextResponse.json({ ok: true, post: data })
}
