import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServiceRole } from '@/lib/supabase'

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const id = String(body?.id || '').trim()
    if (!id) return jsonError('missing id', 400)

    const deviceId = cookies().get('device_id')?.value || String(body?.device_id || '').trim() || null
    if (!deviceId) return jsonError('missing device_id', 400)

    const sb = supabaseServiceRole()
    const { data: row, error } = await sb
      .from('media_items')
      .select('id, storage_path, thumb_url, url, editable_until, uploader_device_id')
      .eq('id', id)
      .maybeSingle()

    if (error) return jsonError(error.message, 500)
    if (!row) return jsonError('not found', 404)
    if (String((row as any).uploader_device_id || '') !== deviceId) return jsonError('forbidden', 403)

    const until = String((row as any).editable_until || '')
    if (!until || Date.now() > new Date(until).getTime()) return jsonError('expired', 403)

    const base = String((row as any).storage_path || '').trim()
    const paths = [base, `${base}.thumb.webp`, base.replace(/\.[^./]+$/, '') + '.thumb.webp'].filter(Boolean)
    await sb.storage.from('uploads').remove(Array.from(new Set(paths))).catch(() => null as any)

    const { error: derr } = await sb.from('media_items').delete().eq('id', id)
    if (derr) return jsonError(derr.message, 500)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return jsonError(e?.message || 'delete failed', 500)
  }
}
