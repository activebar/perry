import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'

function pickRule(body: any) {
  const rule_type = (body?.rule_type === 'allow' ? 'allow' : 'block') as 'allow' | 'block'
  const scope = (body?.scope === 'global' ? 'global' : 'event') as 'global' | 'event'
  const match_type = (body?.match_type === 'exact' ? 'exact' : body?.match_type === 'word' ? 'word' : 'contains') as 'exact' | 'contains' | 'word'
  const expression = String(body?.expression || '').trim()
  const note = body?.note ? String(body.note) : null
  const is_active = body?.is_active === false ? false : true

  return { rule_type, scope, match_type, expression, note, is_active }
}

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const srv = supabaseServiceRole()
    const { data, error } = await srv
      .from('content_rules')
      .select('*')
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, rules: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const row = pickRule(body)
    if (!row.expression) return NextResponse.json({ error: 'missing expression' }, { status: 400 })

    const srv = supabaseServiceRole()
    const { data, error } = await srv
      .from('content_rules')
      .insert({ ...row, created_by: admin?.email || admin?.username || null })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, rule: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const id = Number(body?.id)
    if (!Number.isFinite(id)) return NextResponse.json({ error: 'missing id' }, { status: 400 })

    const patch = pickRule(body)
    if (!patch.expression) return NextResponse.json({ error: 'missing expression' }, { status: 400 })

    const srv = supabaseServiceRole()
    const { data, error } = await srv
      .from('content_rules')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, rule: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const url = new URL(req.url)
    const id = Number(url.searchParams.get('id'))
    if (!Number.isFinite(id)) return NextResponse.json({ error: 'missing id' }, { status: 400 })

    const srv = supabaseServiceRole()
    const { error } = await srv.from('content_rules').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
