import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseServiceRole } from '@/lib/supabase'
import { fetchSettings } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const OG_SIZE = 800

function extractUploadsPathFromPublicUrl(u: string) {
  // https://<project>.supabase.co/storage/v1/object/public/uploads/<path>
  const m = u.match(/\/storage\/v1\/object\/public\/uploads\/(.+)$/)
  return m?.[1] || null
}

function safeShortText(s: string, max = 180) {
  const t = (s || '').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

async function getFirstApprovedPostByPrefix(prefix: string) {
  // The DB uses `status` (not `is_approved`).
  // We purposely keep the select minimal.
  const { data, error } = await supabaseServiceRole
    .from('posts')
    .select('id, author_name, text, media_url, status, kind')
    .eq('kind', 'blessing')
    .eq('status', 'approved')
    .ilike('id', `${prefix}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data || null
}

async function getMediaItemByPrefix(prefix: string) {
  const { data, error } = await supabaseServiceRole
    .from('media_items')
    .select('id, url, type')
    .eq('status', 'approved')
    .ilike('id', `${prefix}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data || null
}

async function fetchImageBuffer(url: string) {
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error(`Failed to fetch image: ${r.status}`)
  const ab = await r.arrayBuffer()
  return Buffer.from(ab)
}

async function toSquareJpeg(input: Buffer) {
  return await sharp(input)
    .rotate() // respect EXIF orientation
    .resize(OG_SIZE, OG_SIZE, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer()
}

export async function GET(req: Request) {
  const url = new URL(req.url)

  const defaultParam = url.searchParams.get('default')
  const post = url.searchParams.get('post')
  const media = url.searchParams.get('media')
  const fallback = url.searchParams.get('fallback')

  // Optional: cache-busting query params like ?v=123 are ignored by logic.

  try {
    const settings = await fetchSettings()

    // 1) Resolve the desired base image URL
    let imageUrl: string | null = null

    // default
    if (defaultParam) {
      imageUrl = (settings as any)?.og_default_image_url || null
    }

    // blessing post
    if (!imageUrl && post) {
      const byUuid = /^[0-9a-f-]{36}$/i.test(post)
      if (byUuid) {
        const { data } = await supabaseServiceRole
          .from('posts')
          .select('media_url, status, kind')
          .eq('id', post)
          .maybeSingle()

        if (data?.kind === 'blessing' && data?.status === 'approved') {
          imageUrl = data.media_url || null
        }
      } else {
        const p = await getFirstApprovedPostByPrefix(post)
        imageUrl = p?.media_url || null
      }
    }

    // gallery media item
    if (!imageUrl && media) {
      const byUuid = /^[0-9a-f-]{36}$/i.test(media)
      if (byUuid) {
        const { data } = await supabaseServiceRole
          .from('media_items')
          .select('url, status')
          .eq('id', media)
          .maybeSingle()

        if (data?.status === 'approved') imageUrl = data.url || null
      } else {
        const m = await getMediaItemByPrefix(media)
        imageUrl = m?.url || null
      }
    }

    // fallback parameter (usually hero image)
    if (!imageUrl && fallback) {
      imageUrl = fallback
    }

    // final fallback to default og image
    if (!imageUrl) {
      imageUrl = (settings as any)?.og_default_image_url || null
    }

    if (!imageUrl) {
      return new NextResponse('Missing OG image source', { status: 404 })
    }

    // 2) If the URL points to Supabase public uploads, try to stream via service-role to avoid edge cases.
    //    (Either path works, but this makes it consistent.)
    const uploadsPath = extractUploadsPathFromPublicUrl(imageUrl)

    let buf: Buffer
    if (uploadsPath) {
      const { data, error } = await supabaseServiceRole.storage.from('uploads').download(uploadsPath)
      if (error) throw error
      buf = Buffer.from(await data.arrayBuffer())
    } else {
      buf = await fetchImageBuffer(imageUrl)
    }

    // 3) Normalize to WhatsApp-friendly square
    const out = await toSquareJpeg(buf)

    return new NextResponse(out, {
      status: 200,
      headers: {
        'content-type': 'image/jpeg',
        // allow caching, but not too aggressive (WhatsApp is sticky anyway)
        'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    })
  } catch (err) {
    // last resort: respond with a tiny error
    const msg = err instanceof Error ? err.message : 'unknown'
    return new NextResponse(`OG error: ${msg}`, { status: 500 })
  }
}
