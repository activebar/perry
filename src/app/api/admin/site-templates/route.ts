import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sb = supabaseServiceRole()
    const { data, error } = await sb
      .from('site_templates')
      .select('id,name,kind,description,is_active,created_at,updated_at')
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ templates: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || '')

    const sb = supabaseServiceRole()

    if (action === 'create_from_event') {
      const sourceEventId = String(body?.source_event_id || '')
      const name = String(body?.name || '').trim()
      const kind = String(body?.kind || 'generic').trim()
      const description = String(body?.description || '').trim() || null
      if (!sourceEventId) return NextResponse.json({ error: 'Missing source_event_id' }, { status: 400 })
      if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })

      // Collect data from event
      const [blocksRes, galleriesRes, rulesRes, settingsRes] = await Promise.all([
        sb.from('blocks').select('*').eq('event_id', sourceEventId),
        sb.from('galleries').select('*').eq('event_id', sourceEventId),
        sb.from('content_rules').select('*').eq('event_id', sourceEventId),
        sb.from('event_settings').select('*').eq('event_id', sourceEventId)
      ])

      const firstErr = blocksRes.error || galleriesRes.error || rulesRes.error || settingsRes.error
      if (firstErr) return NextResponse.json({ error: firstErr.message }, { status: 400 })

      const configJson = {
        source_event_id: sourceEventId,
        blocks: blocksRes.data || [],
        galleries: galleriesRes.data || [],
        content_rules: rulesRes.data || [],
        event_settings: settingsRes.data || []
      }

      const { data, error } = await sb
        .from('site_templates')
        .insert({
          name,
          kind,
          description,
          is_active: true,
          config_json: configJson
        })
        .select('id')
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true, id: data?.id })
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
