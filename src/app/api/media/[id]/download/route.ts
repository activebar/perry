// Path: src/app/api/media/[id]/download/route.ts
// Version: V26.3
// Updated: 2026-03-21 20:05
// Note: proxy media downloads through the app so browsers download reliably even when the original file lives on a cross-origin public URL

import { NextResponse } from 'next/server'
import { supabaseServiceRole, getPublicUploadUrl } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function extFromMime(mime: string) {
  const m = String(mime || '').toLowerCase()
  if (m.includes('png')) return 'png'
  if (m.includes('webp')) return 'webp'
  if (m.includes('gif')) return 'gif'
  if (m.includes('heic')) return 'heic'
  if (m.includes('mp4')) return 'mp4'
  if (m.includes('quicktime')) return 'mov'
  if (m.includes('video')) return 'mp4'
  return 'jpg'
}

async function fetchBuffer(url: string) {
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error(`Failed to fetch media: ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id)
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new NextResponse('Invalid media id', { status: 400 })
  }

  try {
    const sb = supabaseServiceRole()
    const { data: mi, error } = await sb
      .from('media_items')
      .select('id, public_url, url, storage_path, mime_type')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!mi) return new NextResponse('Media not found', { status: 404 })

    const mime = String((mi as any)?.mime_type || '').trim() || 'application/octet-stream'
    const fileExt = extFromMime(mime)
    const filename = `media-${id}.${fileExt}`

    let body: Buffer | null = null

    if ((mi as any)?.storage_path) {
      const path = String((mi as any).storage_path)
      const { data: file, error: dlError } = await sb.storage.from('uploads').download(path)
      if (!dlError && file) {
        body = Buffer.from(await file.arrayBuffer())
      }
    }

    if (!body) {
      const remoteUrl =
        String((mi as any)?.public_url || '').trim() ||
        String((mi as any)?.url || '').trim() ||
        ((mi as any)?.storage_path ? getPublicUploadUrl(String((mi as any).storage_path)) : '')

      if (!remoteUrl) return new NextResponse('Media source missing', { status: 404 })
      body = await fetchBuffer(remoteUrl)
    }

    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        'content-type': mime,
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, no-store, max-age=0',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    return new NextResponse(`Download error: ${msg}`, { status: 500 })
  }
}
