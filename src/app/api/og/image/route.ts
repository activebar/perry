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

    // Nothing found — return a PNG fallback (WhatsApp/Facebook often ignore SVG OG images)
    const fs = await import('fs/promises')
    try {
      const buf = await fs.readFile(process.cwd() + '/public/og-fallback.png')
      return new NextResponse(buf, {
        headers: {
          'content-type': 'image/png',
          'cache-control': 'public, max-age=3600, s-maxage=3600'
        }
      })
    } catch {
      // last resort: 1x1 transparent png
      const tiny = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/P4F6xQAAAABJRU5ErkJggg==',
        'base64'
      )
      return new NextResponse(tiny, {
        headers: {
          'content-type': 'image/png',
          'cache-control': 'public, max-age=3600, s-maxage=3600'
        }
      })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
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
