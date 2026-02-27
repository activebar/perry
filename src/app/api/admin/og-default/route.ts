import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/adminSession'
import { supabaseServiceRole, getPublicUploadUrl } from '@/lib/supabase'
import { getServerEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // Admin only
    const admin = await getAdminFromRequest(req)
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const fd = await req.formData()
    const file = fd.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'missing file' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    const srv = getServerEnv()
    const path = `${srv.EVENT_SLUG}/og/default.jpg`

    const sb = supabaseServiceRole()
    const { error } = await sb.storage.from('uploads').upload(path, buf, {
      contentType: file.type || 'image/jpeg',
      upsert: true
    })
    if (error) throw error

    const publicUrl = getPublicUploadUrl(path)

// Update settings row (PostgREST requires a WHERE clause)
const { data: settingsRow, error: sErr } = await sb
  .from('event_settings')
  .select('id')
  .limit(1)
  .maybeSingle()

if (sErr) throw sErr
if (!settingsRow?.id) throw new Error('Missing event_settings row')

const { error: upErr } = await sb
  .from('event_settings')
  .update({ og_default_image_url: publicUrl })
  .eq('id', settingsRow.id)

if (upErr) throw upErr

    return NextResponse.json({ ok: true, publicUrl, path })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
