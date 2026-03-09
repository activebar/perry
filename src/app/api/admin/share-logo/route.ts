import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole, getPublicUploadUrl } from '@/lib/supabase'
import { getServerEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminFromRequest(req)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const fd = await req.formData()
    const file = fd.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'missing file' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    const srv = getServerEnv()
    const url = new URL(req.url)
    const eventId = String(url.searchParams.get('event') || '').trim() || srv.EVENT_SLUG
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const safeExt = /^(png|jpg|jpeg|webp|svg)$/i.test(ext) ? ext : 'png'
    const path = `${eventId}/og/share-logo.${safeExt}`

    const sb = supabaseServiceRole()
    const { error } = await sb.storage.from('uploads').upload(path, buf, {
      contentType: file.type || 'image/png',
      upsert: true
    })
    if (error) throw error

    const publicUrl = getPublicUploadUrl(path)
    const { data: settingsRow, error: sErr } = await sb
      .from('event_settings')
      .select('id')
      .eq('event_id', eventId)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (sErr) throw sErr
    if (!settingsRow?.id) throw new Error('Missing event_settings row')

    const { error: upErr } = await sb
      .from('event_settings')
      .update({ share_logo_url: publicUrl, share_logo_enabled: true })
      .eq('id', settingsRow.id)
      .eq('event_id', eventId)

    if (upErr) throw upErr

    return NextResponse.json({ ok: true, publicUrl, path })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
