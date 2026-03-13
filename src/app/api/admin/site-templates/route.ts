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
      .select('id,name,kind,description,is_active,source_event_id,created_at,updated_at')
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
    const action = String(body?.action || '').trim()

    const sb = supabaseServiceRole()

    if (action === 'create_from_event' || (!!body?.source_event_id && !action)) {
      const sourceEventId = String(body?.source_event_id || '').trim()
      const name = String(body?.name || '').trim() || `Template ${sourceEventId}`
      const kind = String(body?.kind || 'generic').trim() || 'generic'
      const description = String(body?.description || '').trim() || `נוצר מהאירוע ${sourceEventId}`

      if (!sourceEventId) return NextResponse.json({ error: 'Missing source_event_id' }, { status: 400 })
      if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })

      const { data, error } = await sb
        .from('site_templates')
        .insert({
          name,
          kind,
          description,
          is_active: true,
          source_event_id: sourceEventId,
        })
        .select('id')
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true, id: data?.id, message: 'התבנית נשמרה בהצלחה' })
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
