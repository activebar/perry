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
  // https://<project>.supabase.co/storage/v1/object/public/uploads/<path>
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
    const { searchParams } = new URL(req.url)
    const postId = searchParams.get('post')
    const isDefault = searchParams.get('default') === '1'
    const fallback = searchParams.get('fallback')

    const settings = await fetchSettings().catch(() => null)

    let targetUrl: string | null = null
    let storagePath: string | null = null

    if (postId) {
      const sb = supabaseServiceRole()
      const { data: post } = await sb
        .from('posts')
        .select('id, media_path, media_url')
        .eq('id', postId)
        .maybeSingle()

      storagePath = (post as any)?.media_path || null
      targetUrl = (post as any)?.media_url || null
    }

    if (!postId && isDefault) {
      const heroImages = Array.isArray((settings as any)?.hero_images) ? (settings as any).hero_images : []
      targetUrl =
        (settings as any)?.og_default_image_url ||
        (typeof heroImages[0] === 'string' ? heroImages[0] : null) ||
        (fallback ? String(fallback) : null)
      storagePath = null
    }

    // 1) Prefer storage download when we have a path
    if (storagePath) {
      const buf = await downloadFromUploads(storagePath)
      return new NextResponse(buf, {
        headers: {
          'content-type': guessContentType(storagePath),
          'cache-control': 'public, max-age=3600, s-maxage=3600'
        }
      })
    }

    // 2) If URL points to uploads public URL, extract path and download (works even if bucket is private)
    if (targetUrl && /^https?:\/\//i.test(targetUrl)) {
      const extracted = extractUploadsPathFromPublicUrl(targetUrl)
      if (extracted) {
        const buf = await downloadFromUploads(extracted)
        return new NextResponse(buf, {
          headers: {
            'content-type': guessContentType(extracted),
            'cache-control': 'public, max-age=3600, s-maxage=3600'
          }
        })
      }
    }

    // 3) Remote fetch fallback (only if it's an absolute URL)
    if (targetUrl && /^https?:\/\//i.test(targetUrl)) {
      const { buf, ct } = await fetchRemote(targetUrl)
      return new NextResponse(buf, {
        headers: {
          'content-type': ct || guessContentType(targetUrl),
          'cache-control': 'public, max-age=3600, s-maxage=3600'
        }
      })
    }

    // Nothing found
    const eventName = String((settings as any)?.event_name || 'Event')
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, sans-serif" font-size="64" fill="#ffffff">${escapeXml(eventName)}</text>
  <text x="50%" y="62%" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, sans-serif" font-size="36" fill="#e5e7eb">Event gift website powered by Active Bar</text>
</svg>`
    return new NextResponse(svg, {
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'public, max-age=3600, s-maxage=3600'
      }
    })
  } catch {
    return NextResponse.json({ error: 'error' }, { status: 500 })
  }
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
