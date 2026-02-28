import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/cronAuth'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req)
    const srv = supabaseServiceRole()

    const { data: settings, error: serr } = await srv
      .from('event_settings')
      .select('start_at, archive_after_days, delete_after_hours, verify_drive_before_delete')
      .limit(1)
      .single()
    if (serr) throw serr

    const now = new Date()

    // 1) Gift block auto-hide cleanup (toggle in DB)
    await srv.rpc('hide_gift_block_if_expired', {
      p_start_at: settings.start_at,
      p_now: now.toISOString()
    })

    // 2) Mark items as archived (only if drive synced when verify enabled)
    const archiveCutoff = new Date(now.getTime() - Number(settings.archive_after_days) * 24 * 60 * 60 * 1000)
    const { data: toArchive, error: aerr } = await srv
      .from('media_items')
      .select('*')
      .is('archived_at', null)
      .is('deleted_at', null)
      .lte('created_at', archiveCutoff.toISOString())
      .limit(200)
    if (aerr) throw aerr

    let archived = 0
    let deleted = 0

    for (const it of toArchive || []) {
      const okToArchive = settings.verify_drive_before_delete ? Boolean(it.drive_file_id) : true
      if (!okToArchive) continue
      const deleteAfter = new Date(now.getTime() + Number(settings.delete_after_hours) * 60 * 60 * 1000)
      await srv.from('media_items').update({
        archived_at: now.toISOString(),
        delete_after_at: deleteAfter.toISOString()
      }).eq('id', it.id)
      archived++
    }

    // 3) Delete from Supabase Storage after delete_after_at
    const { data: toDelete, error: derr } = await srv
      .from('media_items')
      .select('*')
      .is('deleted_at', null)
      .not('delete_after_at', 'is', null)
      .lte('delete_after_at', now.toISOString())
      .limit(100)
    if (derr) throw derr

    for (const it of toDelete || []) {
      const okToDelete = settings.verify_drive_before_delete ? Boolean(it.drive_file_id) : true
      if (!okToDelete) continue
      if (!it.storage_path) continue
      try {
        await srv.storage.from('uploads').remove([it.storage_path])
      } catch {
        // ignore
      }
      await srv.from('media_items').update({ deleted_at: now.toISOString() }).eq('id', it.id)
      deleted++
    }

    return NextResponse.json({ ok: true, archived, deleted })
  } catch (e: any) {
    const status = e?.status || 500
    return NextResponse.json({ error: e?.message || 'error' }, { status })
  }
}
