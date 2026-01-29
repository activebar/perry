import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/cronAuth'
import { supabaseServiceRole } from '@/lib/supabase'
import { ensureEventFolderId, uploadBufferToDrive } from '@/lib/gdrive'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req)

    const srv = supabaseServiceRole()
    const { data: items, error } = await srv
      .from('media_items')
      .select('*')
      .is('drive_file_id', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(10)
    if (error) throw error

    if (!items || items.length === 0) return NextResponse.json({ ok: true, processed: 0 })

    const folderId = await ensureEventFolderId()
    let processed = 0

    for (const it of items) {
      try {
        const url = it.public_url
        if (!url) throw new Error('missing public_url')
        const r = await fetch(url)
        if (!r.ok) throw new Error(`fetch failed: ${r.status}`)
        const buf = Buffer.from(await r.arrayBuffer())
        const filename = (it.storage_path || `item_${it.id}`).split('/').pop() || `item_${it.id}`
        const mimeType = it.mime_type || r.headers.get('content-type') || 'application/octet-stream'

        const up = await uploadBufferToDrive({
          filename,
          mimeType,
          buffer: buf,
          parents: [folderId]
        })

        await srv.from('media_items').update({
          drive_file_id: up.fileId,
          drive_preview_url: up.previewUrl,
          synced_at: new Date().toISOString(),
          last_error: null
        }).eq('id', it.id)

        processed++
      } catch (e: any) {
        await srv.from('media_items').update({ last_error: e?.message || 'sync error' }).eq('id', it.id)
      }
    }

    return NextResponse.json({ ok: true, processed })
  } catch (e: any) {
    const status = e?.status || 500
    return NextResponse.json({ error: e?.message || 'error' }, { status })
  }
}
