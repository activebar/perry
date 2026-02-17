import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseServiceRole } from '@/lib/supabase'
import { fetchSettings } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// OpenGraph standard (also works best for WhatsApp previews)
const OG_W = 1200
const OG_H = 630

// In this codebase `supabaseServiceRole` is a factory function that returns a Supabase client.
// Create a client instance for use inside this route module.
const sb = supabaseServiceRole()

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
  const { data, error } = await sb
    .from('posts')
    .select('id, author_name, text, media_url, status, kind')
    .eq('kind', 'blessing')
    .ilike('id', `${prefix}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data || null
}

async function getMediaItemByPrefix(prefix: string) {
  const { data, error } = await sb
    .from('media_items')
    .select('id, public_url, mime_type, kind')
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

async function toOgJpeg(input: Buffer) {
  return await sharp(input)
    .rotate() // respect EXIF orientation
    .resize(OG_W, OG_H, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer()
}

export async function GET(req: Request) {
  const url = new URL(req.url)

  const defaultParam = url.searchParams.get('default')
  const post = url.searchParams.get('post')
  const media = url.searchParams.get('media')
  const fallback = url.searchParams.get('fallback')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const bucket = 'uploads'
  const eventSlug = process.env.EVENT_SLUG || process.env.NEXT_PUBLIC_EVENT_SLUG || 'ido'
  const toPublic = (storagePath: string) =>
    supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}` : ''

  // Optional: cache-busting query params like ?v=123 are ignored by logic.

  try {
    const settings = await fetchSettings()

    // 1) Resolve the desired base image URL
    let imageUrl: string | null = null

// default (site-wide OG image)
if (defaultParam) {
  imageUrl =
    (settings as any)?.og_default_image_url ||
    toPublic(`${eventSlug}/og/default.jpg`) ||
    null
}

    // blessing post
    if (!imageUrl && post) {
      const byUuid = /^[0-9a-f-]{36}$/i.test(post)
      if (byUuid) {
        const { data } = await sb
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
        // Support both media_items.id (preferred) and legacy links that pass media_items.post_id
        const { data } = await sb
          .from('media_items')
          .select('public_url, storage_path, mime_type, id, post_id')
          .or(`id.eq.${media},post_id.eq.${media}`)
          .limit(1)
          .maybeSingle()

        if (data) {
          const pu = (data as any).public_url as string | null | undefined
          const sp = (data as any).storage_path as string | null | undefined
          imageUrl = (pu && pu.trim()) ? pu : (sp ? toPublic(sp) : null)
        }
      } else {
        const m = await getMediaItemByPrefix(media)
        const pu = (m as any)?.public_url as string | null | undefined
        const sp = (m as any)?.storage_path as string | null | undefined
        imageUrl = (pu && pu.trim()) ? pu : (sp ? toPublic(sp) : null)
      }
    }

    // fallback parameter (usually hero image)
    if (!imageUrl && fallback) {
      imageUrl = fallback
    }

// final fallback to default og image (settings value, or storage default.jpg)
if (!imageUrl) {
  imageUrl =
    (settings as any)?.og_default_image_url ||
    toPublic(`${eventSlug}/og/default.jpg`) ||
    null
}

    if (!imageUrl) {
      return new NextResponse('Missing OG image source', { status: 404 })
    }

    // 2) If the URL points to Supabase public uploads, try to stream via service-role to avoid edge cases.
    //    (Either path works, but this makes it consistent.)
    const uploadsPath = extractUploadsPathFromPublicUrl(imageUrl)

    let buf: Buffer
    if (uploadsPath) {
      const { data, error } = await sb.storage.from('uploads').download(uploadsPath)
      if (error) throw error
      buf = Buffer.from(await data.arrayBuffer())
    } else {
      buf = await fetchImageBuffer(imageUrl)
    }

    // 3) Normalize to OpenGraph-friendly 1200x630 (best for WhatsApp previews)
    const out = await toOgJpeg(buf)

    const body = new Uint8Array(out)

    return new NextResponse(body, {
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
