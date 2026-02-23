import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabaseServiceRole
      .from('site_templates')
      .select('id,name,kind,description,config_json,is_active,created_at,updated_at')
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ ok: true, templates: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const name = String(body?.name || '').trim()
    const kind = String(body?.kind || '').trim()
    const description = String(body?.description || '').trim()
    const config_json = body?.config_json ?? null
    const is_active = body?.is_active === false ? false : true

    if (!name) return NextResponse.json({ error: 'missing name' }, { status: 400 })
    if (!kind) return NextResponse.json({ error: 'missing kind' }, { status: 400 })
    if (!config_json) return NextResponse.json({ error: 'missing config_json' }, { status: 400 })

    const { data, error } = await supabaseServiceRole
      .from('site_templates')
      .insert([{ name, kind, description: description || null, config_json, is_active }])
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ ok: true, template: data })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
