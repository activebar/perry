import { NextRequest, NextResponse } from 'next/server'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const id = String(body?.id || '').trim()
    const uploader_device_id = String(body?.uploader_device_id || '').trim()

    if (!id || !uploader_device_id) {
      return NextResponse.json({ error: 'missing fields' }, { status: 400 })
    }

    const sb = supabaseServiceRole()
    const { data, error } = await sb
      .from('media_items')
      .select('id,storage_path,editable_until,uploader_device_id')
      .eq('id', id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })

    if (!data.uploader_device_id || data.uploader_device_id !== uploader_device_id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const until = data.editable_until ? new Date(data.editable_until).getTime() : 0
    if (!until || !Number.isFinite(until) || Date.now() > until) {
      return NextResponse.json({ error: 'expired' }, { status: 403 })
    }

    const path = String(data.storage_path || '').trim()
    if (!path) return NextResponse.json({ error: 'missing storage_path' }, { status: 400 })

    // Delete original + thumb
    const del = await sb.storage.from('uploads').remove([path, `${path}.thumb.webp`])
    // ignore storage errors only if file was already gone
    if (del?.error) {
      return NextResponse.json({ error: del.error.message }, { status: 500 })
    }

    const delRow = await sb.from('media_items').delete().eq('id', id)
    if (delRow.error) return NextResponse.json({ error: delRow.error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}
