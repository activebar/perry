import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const status = req.nextUrl.searchParams.get('status') || 'pending'
  const kind = req.nextUrl.searchParams.get('kind')
  const srv = supabaseServiceRole()
  let q = srv.from('posts').select('*').eq('status', status).order('created_at', { ascending: false }).limit(200)
  if (kind) q = q.eq('kind', kind)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, posts: data })
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id, status } = await req.json()
  if (!id || !status) return NextResponse.json({ error: 'missing' }, { status: 400 })
  const srv = supabaseServiceRole()
  const { data, error } = await srv.from('posts').update({ status }).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, post: data })
}
