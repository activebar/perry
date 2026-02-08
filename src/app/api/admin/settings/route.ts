import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest, requireAnyPermission, requirePermission } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'

/**
 * NOTE:
 * During development it's easy to accidentally create multiple rows in event_settings.
 * The site homepage reads the *latest* row (updated_at/created_at desc).
 * To keep admin + homepage in sync, the admin API must also read/update the same latest row.
 */
async function getLatestSettingsRow(event_id: string) {
  const srv = supabaseServiceRole()
  const { data, error } = await srv
    .from('event_settings')
    .select('*')
    .eq('event_id', event_id)
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
    let row = await getLatestSettingsRow(String((admin as any).event_id || 'default'))

    const lockDays = Number((row as any).approval_lock_after_days ?? 7)
    const startAt = new Date((row as any).start_at)
    const lockAt = Number.isFinite(lockDays) && lockDays > 0 ? new Date(startAt.getTime() + lockDays * 24 * 60 * 60 * 1000) : null
    const isLocked = lockAt ? new Date() >= lockAt : false

    if (isLocked && (row as any).require_approval === false) {
      await supabaseServiceRole().from('event_settings').update({ require_approval: true }).eq('id', (row as any).id)
      row = await getLatestSettingsRow(String((admin as any).event_id || 'default'))
    }
    return NextResponse.json({ ok: true, settings: row })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminFromRequest(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // event-access (code login) can update only with explicit permission.
  // We map settings sections to granular perms:
  // - blessings settings -> blessings.settings.edit
  // - share/QR settings -> share.settings.edit
  // - OpenGraph settings -> og.settings.edit
  // Fallback: event.edit / event.settings.edit
  if (admin.role !== 'master') {
    const patch = await req.json()

    const keys = new Set(Object.keys(patch || {}))
    const hasAny = (arr: string[]) => arr.some(k => keys.has(k))

    const BLESS_KEYS = [
      'blessings_title',
      'blessings_subtitle',
      'blessings_limit',
      'require_approval',
      'approval_lock_after_days',
      'max_blessing_lines',
      'show_link_preview',
      'preview_image_size'
    ]
    const SHARE_KEYS = [
      'show_qr_admin',
      'show_qr_public',
      'enable_whatsapp_share',
      'enable_web_share',
      'enable_permalink_share'
    ]
    const OG_KEYS = ['og_title', 'og_description', 'og_image', 'og_site_name']

    const needBless = hasAny(BLESS_KEYS)
    const needShare = hasAny(SHARE_KEYS)
    const needOg = hasAny(OG_KEYS)

    if (needBless) requireAnyPermission(admin, ['blessings.settings.edit', 'event.settings.edit', 'event.edit'])
    if (needShare) requireAnyPermission(admin, ['share.settings.edit', 'event.settings.edit', 'event.edit'])
    if (needOg) requireAnyPermission(admin, ['og.settings.edit', 'event.settings.edit', 'event.edit'])

    // any other settings require generic event settings permission
    if (!needBless && !needShare && !needOg) {
      requireAnyPermission(admin, ['event.settings.edit', 'event.edit'])
    }

    // continue with same patch below
    try {
      const row = await getLatestSettingsRow(String((admin as any).event_id || 'default'))

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
      const status = e?.status || 500
      return NextResponse.json({ error: e?.message || 'error' }, { status })
    }
  }

  try {
    const patch = await req.json()
    const row = await getLatestSettingsRow(String((admin as any).event_id || 'default'))

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
