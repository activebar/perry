import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const srv = supabaseServiceRole()
  const { data, error } = await srv.from('ads').select('*').order('created_at', { ascending: false }).limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, ads: data })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  const srv = supabaseServiceRole()
  const { data, error } = await srv.from('ads').insert({
    title: body.title,
    body: body.body || null,
    image_url: body.image_url || null,
    link_url: body.link_url || null,
    is_active: body.is_active ?? true
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, ad: data })
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body?.id) return NextResponse.json({ error: 'missing id' }, { status: 400 })
  const srv = supabaseServiceRole()
  const { data, error } = await srv.from('ads').update(body).eq('id', body.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, ad: data })
}

export async function DELETE(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })
  const srv = supabaseServiceRole()
  const { error } = await srv.from('ads').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
