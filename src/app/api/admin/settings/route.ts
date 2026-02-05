import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'

/**
 * NOTE:
 * During development it's easy to accidentally create multiple rows in event_settings.
 * The site homepage reads the *latest* row (updated_at/created_at desc).
 * To keep admin + homepage in sync, the admin API must also read/update the same latest row.
 */
async function getLatestSettingsRow() {
  const srv = supabaseServiceRole()
  const { data, error } = await srv
    .from('event_settings')
    .select('*')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) throw error
  return data as any
}

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    let row = await getLatestSettingsRow()
    return NextResponse.json({ ok: true, settings: row })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const patch = await req.json()
    const row = await getLatestSettingsRow()

    // approval_opened_at should change only when the admin explicitly opens approvals
    // by switching require_approval from true to false.
    if ('require_approval' in patch) {
      const next = Boolean(patch.require_approval)
      const prev = Boolean(row.require_approval)
      if (prev === true && next === false) {
        patch.approval_opened_at = new Date().toISOString()
      }
    }

    const srv = supabaseServiceRole()
    const { data, error } = await srv
      .from('event_settings')
      .update(patch)
      .eq('id', row.id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, settings: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
