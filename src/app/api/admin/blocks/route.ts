import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest, requireMaster } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    requireMaster(admin)
  } catch (e: any) {
    return NextResponse.json({ error: 'forbidden' }, { status: (e as any)?.status || 403 })
  }
  const srv = supabaseServiceRole()
  const { data, error } = await srv.from('blocks').select('*').order('order_index', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, blocks: data })
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    requireMaster(admin)
  } catch (e: any) {
    return NextResponse.json({ error: 'forbidden' }, { status: (e as any)?.status || 403 })
  }
  const patch = await req.json()
  if (!patch?.id) return NextResponse.json({ error: 'missing id' }, { status: 400 })
  const srv = supabaseServiceRole()
  const { data, error } = await srv.from('blocks').update(patch).eq('id', patch.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, block: data })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    requireMaster(admin)
  } catch (e: any) {
    return NextResponse.json({ error: 'forbidden' }, { status: (e as any)?.status || 403 })
  }
  const { ids } = await req.json()
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: 'missing ids' }, { status: 400 })
  const srv = supabaseServiceRole()
  const updates = ids.map((id: string, idx: number) => ({ id, order_index: idx + 1 }))
  const { error } = await srv.from('blocks').upsert(updates, { onConflict: 'id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
