import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole } from '@/lib/supabase'
import { getServerEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

export async function DELETE(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const env = getServerEnv()
    const body = await req.json().catch(() => ({}))
    const id = body?.id as string | undefined
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const srv = supabaseServiceRole()

    // Read item first (to know storage_path)
    const { data: item, error: readErr } = await srv
      .from('media_items')
      .select('id, event_id, storage_path')
      .eq('id', id)
      .maybeSingle()

    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
    if (!item) return NextResponse.json({ ok: true })

    // Safety: only within this event
    if (String(item.event_id) !== String(env.eventId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (item.storage_path) {
      // uploads/<event>/<kind>/...
      await srv.storage.from('uploads').remove([String(item.storage_path)])
    }

    await srv.from('media_items').delete().eq('id', id)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
