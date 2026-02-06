import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'

const ALLOWED_KINDS = new Set(['blessing', 'gallery', 'gallery_admin'])

function getEventIdFromEnv() {
  const v = (process.env.EVENT_ID || process.env.NEXT_PUBLIC_EVENT_ID || '').trim()
  return v || 'IDO'
}

function applyStatusFilter(q: any, statusRaw: string) {
  const s = (statusRaw || '').trim().toLowerCase()
  if (!s) return q

  if (s === 'pending') {
    return q.or('status.ilike.pending%,status.ilike.awaiting%')
  }
  if (s === 'approved') {
    return q.ilike('status', 'approved')
  }
  if (s === 'rejected') {
    return q.or('status.ilike.rejected%,status.ilike.denied%')
  }
  if (s === 'deleted') {
    return q.ilike('status', 'deleted')
  }
  return q
}

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const kind = (req.nextUrl.searchParams.get('kind') || '').trim()
  const statusRaw = (req.nextUrl.searchParams.get('status') || '').trim()

  const event_id = getEventIdFromEnv()
  const srv = supabaseServiceRole()

  let q: any = srv
    .from('posts')
    .select('*')
    .eq('event_id', event_id)
    .order('created_at', { ascending: false })
    .limit(500)

  if (kind && ALLOWED_KINDS.has(kind)) q = q.eq('kind', kind)
  q = applyStatusFilter(q, statusRaw)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, posts: data || [] })
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

    const patch: any = {}

    if (typeof body.status === 'string' && body.status.trim()) {
      patch.status = body.status.trim().toLowerCase()
    }

    const editableFields = ['author_name', 'text', 'link_url', 'media_url', 'media_path', 'video_url']
    for (const k of editableFields) {
      if (k in body) patch[k] = body[k] || null
    }

    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
    }

    const event_id = getEventIdFromEnv()
    const srv = supabaseServiceRole()

    const { data, error } = await srv
      .from('posts')
      .update(patch)
      .eq('id', id)
      .eq('event_id', event_id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, post: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
