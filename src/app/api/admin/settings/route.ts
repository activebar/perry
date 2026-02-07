import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest, requirePermission } from '@/lib/adminSession'
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

    const lockDays = Number((row as any).approval_lock_after_days ?? 7)
    const startAt = new Date((row as any).start_at)
    const lockAt = Number.isFinite(lockDays) && lockDays > 0 ? new Date(startAt.getTime() + lockDays * 24 * 60 * 60 * 1000) : null
    const isLocked = lockAt ? new Date() >= lockAt : false

    if (isLocked && (row as any).require_approval === false) {
      await supabaseServiceRole().from('event_settings').update({ require_approval: true }).eq('id', (row as any).id)
      row = await getLatestSettingsRow()
    }
    return NextResponse.json({ ok: true, settings: row })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // event-access (code login) can update only with explicit permission
  if (admin.role !== 'master') {
    requirePermission(admin, 'event.edit')
  }

  try {
    const patch = await req.json()
    const row = await getLatestSettingsRow()

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
