
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
  const posts = data || []
  const ids = posts.map((x: any) => x.id)
  if (!ids.length) return NextResponse.json({ ok: true, posts })
  const { data: mediaRows } = await sb.from('media_items').select('post_id, crop_position, crop_focus_x, crop_focus_y').in('post_id', ids)
  const mediaByPost = new Map<string, any>()
  for (const m of mediaRows || []) {
    const pid = String((m as any).post_id || '')
    if (!pid || mediaByPost.has(pid)) continue
    mediaByPost.set(pid, m)
  }
  return NextResponse.json({ ok: true, posts: posts.map((p: any) => ({ ...p, crop_position: mediaByPost.get(String(p.id))?.crop_position ?? null, crop_focus_x: mediaByPost.get(String(p.id))?.crop_focus_x ?? null, crop_focus_y: mediaByPost.get(String(p.id))?.crop_focus_y ?? null })) })
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return jsonError('unauthorized', 401)
  const body = await req.json().catch(() => ({}))
  const id = String((body as any).id || '').trim()
  if (!id) return jsonError('missing id', 400)
  const sb = supabaseServiceRole()
  const patch: Record<string, any> = {}
  for (const key of ['author_name','text','link_url','media_url','media_path','video_url','status']) {
    if (key in (body as any)) patch[key] = (body as any)[key] ?? null
  }
  let data: any = null
  if (Object.keys(patch).length > 0) {
    const updated = await sb.from('posts').update(patch).eq('event_id', (admin as any).event_id || getEventIdFromRequest(req)).eq('id', id).select('*').single()
    if (updated.error) return jsonError(updated.error.message, 500)
    data = updated.data
  } else {
    const current = await sb.from('posts').select('*').eq('event_id', (admin as any).event_id || getEventIdFromRequest(req)).eq('id', id).single()
    if (current.error) return jsonError(current.error.message, 500)
    data = current.data
  }
  if ('crop_position' in (body as any) || 'crop_focus_x' in (body as any) || 'crop_focus_y' in (body as any)) {
    const cropPatch: Record<string, any> = {}
    if ('crop_position' in (body as any)) cropPatch.crop_position = (body as any).crop_position
    if ('crop_focus_x' in (body as any)) cropPatch.crop_focus_x = (body as any).crop_focus_x
    if ('crop_focus_y' in (body as any)) cropPatch.crop_focus_y = (body as any).crop_focus_y
    await sb.from('media_items').update(cropPatch).eq('post_id', id)
  }
  return NextResponse.json({ ok: true, post: data })
}
