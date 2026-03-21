// Path: src/app/og/default/route.ts
// Version: V26.7
// Updated: 2026-03-21 20:45
// Note: stable default OG image route that serves admin-configured default image or falls back to /api/og/image?default=1

import { NextResponse } from 'next/server'
import { supabaseServiceRole } from '@/lib/supabase'
import { fetchSettings } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function guessContentType(urlOrPath?: string | null) {
  const s = String(urlOrPath || '').toLowerCase()
  if (s.endsWith('.png')) return 'image/png'
  if (s.endsWith('.webp')) return 'image/webp'
  if (s.endsWith('.gif')) return 'image/gif'
  if (s.endsWith('.jpg') || s.endsWith('.jpeg')) return 'image/jpeg'
  return 'image/jpeg'
}

function extractUploadsPathFromPublicUrl(u: string) {
  const m = u.match(/\/storage\/v1\/object\/(public|sign)\/uploads\/(.+)$/i)
  return m?.[2] ? decodeURIComponent(m[2]) : null
}

async function downloadFromUploads(path: string) {
  const sb = supabaseServiceRole()
  const clean = path.replace(/^\/+/, '')
  const { data, error } = await sb.storage.from('uploads').download(clean)
  if (error || !data) throw new Error(error?.message || 'download failed')
  const buf = Buffer.from(await data.arrayBuffer())
  return buf
}

async function fetchRemote(url: string) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error('fetch failed')
  const buf = Buffer.from(await res.arrayBuffer())
  const ct = res.headers.get('content-type') || undefined
  return { buf, ct }
}

export async function GET(req: Request) {
  try {
    const settings = await fetchSettings().catch(() => null)
    const ogUrl = String((settings as any)?.og_default_image_url || '').trim()

    const uploadsPath = ogUrl ? extractUploadsPathFromPublicUrl(ogUrl) : null
    if (uploadsPath) {
      const buf = await downloadFromUploads(uploadsPath)
      return new NextResponse(buf, {
        headers: {
          'content-type': guessContentType(uploadsPath),
          'cache-control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
        },
      })
    }

    if (ogUrl && /^https?:\/\//i.test(ogUrl)) {
      const { buf, ct } = await fetchRemote(ogUrl)
      return new NextResponse(buf, {
        headers: {
          'content-type': ct || guessContentType(ogUrl),
          'cache-control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
        },
      })
    }
  } catch {
    // continue to fallback
  }

  try {
    const origin = new URL(req.url).origin
    const fallbackRes = await fetch(`${origin}/api/og/image?default=1`, { redirect: 'follow' })
    if (fallbackRes.ok) {
      const buf = Buffer.from(await fallbackRes.arrayBuffer())
      const ct = fallbackRes.headers.get('content-type') || 'image/jpeg'
      return new NextResponse(buf, {
        headers: {
          'content-type': ct,
          'cache-control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
        },
      })
    }
  } catch {
    // ignore
  }

  return new NextResponse('missing', { status: 404 })
}
