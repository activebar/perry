import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const ALLOWED_RULE_TYPES = new Set(['block', 'allow'])
const ALLOWED_MATCH_TYPES = new Set(['contains', 'exact', 'whole_word'])

export async function GET(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const srv = supabaseServiceRole()
    const { data, error } = await srv
      .from('content_rules')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ rules: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const rule_type = String(body?.rule_type || 'block')
    const match_type = String(body?.match_type || 'contains')
    const phrase = String(body?.phrase || '').trim()
    const is_active = body?.is_active === false ? false : true
    const note = body?.note ? String(body.note) : null

    if (!ALLOWED_RULE_TYPES.has(rule_type)) return NextResponse.json({ error: 'Invalid rule_type' }, { status: 400 })
    if (!ALLOWED_MATCH_TYPES.has(match_type)) return NextResponse.json({ error: 'Invalid match_type' }, { status: 400 })
    if (!phrase) return NextResponse.json({ error: 'Missing phrase' }, { status: 400 })

    const srv = supabaseServiceRole()
    const { data, error } = await srv
      .from('content_rules')
      .insert({ rule_type, match_type, phrase, is_active, note })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ rule: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const id = String(body?.id || '')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const patch: any = {}
    if (body?.rule_type !== undefined) {
      const v = String(body.rule_type)
      if (!ALLOWED_RULE_TYPES.has(v)) return NextResponse.json({ error: 'Invalid rule_type' }, { status: 400 })
      patch.rule_type = v
    }
    if (body?.match_type !== undefined) {
      const v = String(body.match_type)
      if (!ALLOWED_MATCH_TYPES.has(v)) return NextResponse.json({ error: 'Invalid match_type' }, { status: 400 })
      patch.match_type = v
    }
    if (body?.phrase !== undefined) patch.phrase = String(body.phrase || '').trim()
    if (body?.is_active !== undefined) patch.is_active = !!body.is_active
    if (body?.note !== undefined) patch.note = body.note ? String(body.note) : null

    if (patch.phrase !== undefined && !patch.phrase) return NextResponse.json({ error: 'Missing phrase' }, { status: 400 })

    const srv = supabaseServiceRole()
    const { data, error } = await srv
      .from('content_rules')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ rule: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = String(searchParams.get('id') || '')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const srv = supabaseServiceRole()
    const { error } = await srv.from('content_rules').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
