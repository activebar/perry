import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'

const ALLOWED_KINDS = new Set(['blessing', 'gallery', 'gallery_admin'])
const ALLOWED_STATUS = new Set(['pending', 'approved', 'deleted'])

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const kind = (req.nextUrl.searchParams.get('kind') || '').trim()
  const status = (req.nextUrl.searchParams.get('status') || '').trim()

  const srv = supabaseServiceRole()
  let q = srv.from('posts').select('*').order('created_at', { ascending: false }).limit(500)

  if (kind && ALLOWED_KINDS.has(kind)) q = q.eq('kind', kind)
  if (status && ALLOWED_STATUS.has(status)) q = q.eq('status', status)

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

    // allow: status update + editing fields for content moderation
    const patch: any = {}
    if (typeof body.status === 'string' && ALLOWED_STATUS.has(body.status)) patch.status = body.status

    const editableFields = ['author_name', 'text', 'link_url', 'media_url', 'media_path', 'video_url']
    for (const k of editableFields) {
      if (k in body) patch[k] = body[k] || null
    }

    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
    }

    const srv = supabaseServiceRole()
    const { data, error } = await srv.from('posts').update(patch).eq('id', id).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, post: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
