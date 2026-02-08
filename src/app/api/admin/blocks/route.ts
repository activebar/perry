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

  // IMPORTANT:
  // We must NOT use upsert() here.
  // Upsert can attempt to INSERT missing rows with only {id, order_index},
  // which violates NOT NULL constraints (e.g. blocks.type).
  // Instead, update existing rows only.
  const updates = ids.map((id: string, idx: number) => ({ id, order_index: idx + 1 }))
  const results = await Promise.all(
    updates.map(u => srv.from('blocks').update({ order_index: u.order_index }).eq('id', u.id))
  )
  const firstErr = results.find(r => (r as any)?.error)?.error
  if (firstErr) return NextResponse.json({ error: firstErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
