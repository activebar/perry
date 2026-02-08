import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseServiceRole, getPublicUploadUrl } from '@/lib/supabase'
import { getServerEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    const kind = String(fd.get('kind') || 'gallery')
    if (!file) return NextResponse.json({ error: 'missing file' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
    const srv = getServerEnv()
    const path = `${srv.EVENT_SLUG}/${kind}/${Date.now()}_${randomUUID()}.${ext}`

    const sb = supabaseServiceRole()
    const { error } = await sb.storage.from('uploads').upload(path, buf, {
      contentType: file.type || 'application/octet-stream',
      upsert: false
    })
    if (error) throw error

    const publicUrl = getPublicUploadUrl(path)
    await sb.from('media_items').insert({
      kind,
      storage_path: path,
      public_url: publicUrl,
      mime_type: file.type || null
    })

    return NextResponse.json({ ok: true, path, publicUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
