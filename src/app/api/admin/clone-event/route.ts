import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function normalizeEventId(raw: string) {
  let s = String(raw || '').trim().toLowerCase()
  s = s.replace(/[_\s]+/g, '-')
  s = s.replace(/[^a-z0-9-]+/g, '-')
  s = s.replace(/-+/g, '-')
  s = s.replace(/^-+/, '').replace(/-+$/, '')
  return s
}

function isValidEventId(id: string) {
  if (!id) return false
  if (id.length > 24) return false
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)
}

function stripRow(row: any, overrides: Record<string, any>) {
  const copy: any = { ...row }
  // common columns to avoid copying
  delete copy.id
  delete copy.created_at
  delete copy.updated_at
  delete copy.inserted_at
  delete copy.user_id
  delete copy.device_id
  return { ...copy, ...overrides }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const sourceEventId = String(body?.source_event_id || '')
    const targetEventIdRaw = String(body?.target_event_id || '').trim()
    const targetEventId = normalizeEventId(targetEventIdRaw)
    const targetEventName = String(body?.target_event_name || '').trim()
    const templateId = String(body?.template_id || '').trim()

    if (!sourceEventId) return NextResponse.json({ error: 'חסר מקור שכפול' }, { status: 400 })
    if (!targetEventId) return NextResponse.json({ error: 'חובה למלא event id' }, { status: 400 })
    if (!templateId) return NextResponse.json({ error: 'חובה לבחור תבנית' }, { status: 400 })
    if (!targetEventName || targetEventName.length < 2) return NextResponse.json({ error: 'חובה למלא שם תצוגה' }, { status: 400 })
    if (!isValidEventId(targetEventId)) return NextResponse.json({ error: 'event id לא תקין, מותר אנגלית קטנה, מספרים ומקפים, עד 24 תווים' }, { status: 400 })

    const sb = supabaseServiceRole()

    // prevent duplicates
    const existsRes = await sb.from('event_settings').select('id').eq('event_id', targetEventId).limit(1)
    if (existsRes.error) return NextResponse.json({ error: existsRes.error.message }, { status: 400 })
    if ((existsRes.data || []).length > 0) {
      return NextResponse.json({ error: 'event id כבר קיים, בחר שם אחר' }, { status: 409 })
    }

    // load template
    const tplRes = await sb.from('site_templates').select('id,config_json').eq('id', templateId).single()
    if (tplRes.error) return NextResponse.json({ error: tplRes.error.message }, { status: 400 })

    const cfg = (tplRes.data as any)?.config_json || {}
    const blocks = Array.isArray(cfg?.blocks) ? cfg.blocks : []
    const galleries = Array.isArray(cfg?.galleries) ? cfg.galleries : []
    const rules = Array.isArray(cfg?.content_rules) ? cfg.content_rules : []
    const settings = Array.isArray(cfg?.event_settings) ? cfg.event_settings : []

    // sanity: ensure target does not exist (event_settings rows are our marker)
    const existsRes = await sb.from('event_settings').select('id').eq('event_id', targetEventId).limit(1)
    if (existsRes.error) return NextResponse.json({ error: existsRes.error.message }, { status: 400 })
    if ((existsRes.data || []).length > 0) {
      return NextResponse.json({ error: 'Target event_id already exists' }, { status: 400 })
    }

    // insert event_settings first
    const settingsRows = settings.map((r: any) => {
      const next = stripRow(r, { event_id: targetEventId })
      if (targetEventName && (next.key === 'event_name' || next.name === 'event_name')) {
        next.value = targetEventName
        next.val = targetEventName
      }
      return next
    })

    if (settingsRows.length) {
      const ins = await sb.from('event_settings').insert(settingsRows)
      if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 })
    }

    const blocksRows = blocks.map((r: any) => stripRow(r, { event_id: targetEventId }))
    if (blocksRows.length) {
      const ins = await sb.from('blocks').insert(blocksRows)
      if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 })
    }

    const galleriesRows = galleries.map((r: any) => stripRow(r, { event_id: targetEventId }))
    if (galleriesRows.length) {
      const ins = await sb.from('galleries').insert(galleriesRows)
      if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 })
    }

    const rulesRows = rules.map((r: any) => stripRow(r, { event_id: targetEventId }))
    if (rulesRows.length) {
      const ins = await sb.from('content_rules').insert(rulesRows)
      if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
