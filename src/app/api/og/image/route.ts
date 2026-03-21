// Path: src/app/api/og/image/route.ts
// Version: V26.8
// Updated: 2026-03-21 21:05
// Note: robust square OG image route with hard fallback to /og/default and no ido fallback

import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseServiceRole, getPublicUploadUrl } from '@/lib/supabase'
import { fetchSettings } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const OG_SIZE = 630
const sb = supabaseServiceRole()

function extractUploadsPathFromPublicUrl(u: string) {
  const m = String(u || '').match(/\/storage\/v1\/object\/public\/uploads\/(.+)$/)
  return m?.[1] || null
}

async function fetchImageBuffer(url: string) {
  const r = await fetch(url, { cache: 'no-store', redirect: 'follow' })
  if (!r.ok) throw new Error(`Failed to fetch image: ${r.status}`)
  const ab = await r.arrayBuffer()
  return Buffer.from(ab)
}

async function loadBufferFromAnyUrl(url: string) {
  const uploadsPath = extractUploadsPathFromPublicUrl(url)
  if (uploadsPath) {
    const { data, error } = await sb.storage.from('uploads').download(uploadsPath)
    if (error || !data) throw new Error(error?.message || 'storage download failed')
    return Buffer.from(await data.arrayBuffer())
  }
  return fetchImageBuffer(url)
}

async function getPostByIdOrPrefix(post: string) {
  const byUuid = /^[0-9a-f-]{36}$/i.test(post)
  let q = sb
    .from('posts')
    .select('id, event_id, media_url, status, kind')
    .eq('kind', 'blessing')
    .limit(1)

  if (byUuid) q = q.eq('id', post)
  else q = q.ilike('id', `${post}%`).order('created_at', { ascending: false })

  const { data, error } = await q.maybeSingle()
  if (error) throw error
  return data || null
}

async function getMediaItemByIdOrPrefix(media: string) {
  const byUuid = /^[0-9a-f-]{36}$/i.test(media)
  let q = sb
    .from('media_items')
    .select('id, event_id, public_url, url, storage_path, thumb_url, kind, post_id, gallery_id, is_approved')
    .limit(1)

  if (byUuid) q = q.or(`id.eq.${media},post_id.eq.${media}`)
  else q = q.ilike('id', `${media}%`).order('created_at', { ascending: false })

  const { data, error } = await q.maybeSingle()
  if (error) throw error
  return data || null
}

async function getApprovedGalleryCover(galleryId: string) {
  const { data, error } = await sb
    .from('media_items')
    .select('id, event_id, public_url, url, storage_path, thumb_url, gallery_id, is_approved')
    .eq('gallery_id', galleryId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data || null
}

async function toSquareJpeg(input: Buffer) {
  return sharp(input)
    .rotate()
    .resize(OG_SIZE, OG_SIZE, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer()
}

function pickImageUrl(row: any) {
  return (
    String(row?.thumb_url || '').trim() ||
    String(row?.public_url || '').trim() ||
    String(row?.url || '').trim() ||
    (row?.storage_path ? getPublicUploadUrl(String(row.storage_path)) : '') ||
    ''
  )
}

async function fetchDefaultOg(reqUrl: string) {
  const origin = new URL(reqUrl).origin
  const r = await fetch(`${origin}/og/default`, { cache: 'no-store', redirect: 'follow' })
  if (!r.ok) throw new Error(`Default OG fetch failed: ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const defaultParam = url.searchParams.get('default')
  const post = url.searchParams.get('post')
  const media = url.searchParams.get('media')
  const gallery = url.searchParams.get('gallery')
  const fallback = url.searchParams.get('fallback')
  const eventSlugFromUrl = String(url.searchParams.get('event') || '').trim()

  let eventSlug = eventSlugFromUrl

  try {
    let imageUrl: string | null = null

    if (post) {
      const p = await getPostByIdOrPrefix(post)
      if (p?.kind === 'blessing' && p?.status === 'approved') {
        imageUrl = String((p as any).media_url || '').trim() || null
        if ((p as any)?.event_id) eventSlug = String((p as any).event_id)
      }
    }

    if (!imageUrl && media) {
      const m = await getMediaItemByIdOrPrefix(media)
      if (m) {
        imageUrl = pickImageUrl(m) || null
        if ((m as any)?.event_id) eventSlug = String((m as any).event_id)
      }
    }

    if (!imageUrl && gallery) {
      const cover = await getApprovedGalleryCover(gallery)
      if (cover) {
        imageUrl = pickImageUrl(cover) || null
        if ((cover as any)?.event_id) eventSlug = String((cover as any).event_id)
      }
    }

    const settings = eventSlug ? await fetchSettings(eventSlug).catch(() => null) : null
    const defaultUrl =
      String((settings as any)?.og_default_image_url || '').trim() ||
      (eventSlug ? getPublicUploadUrl(`${eventSlug}/og/default.jpg`) : '')

    if (!imageUrl && defaultParam) imageUrl = defaultUrl || null
    if (!imageUrl && fallback) imageUrl = fallback
    if (!imageUrl) imageUrl = defaultUrl || null

    let out: Buffer

    if (imageUrl) {
      const buf = await loadBufferFromAnyUrl(imageUrl)
      out = await toSquareJpeg(buf)
    } else {
      const fallbackBuf = await fetchDefaultOg(req.url)
      out = await toSquareJpeg(fallbackBuf)
    }

    return new NextResponse(new Uint8Array(out), {
      status: 200,
      headers: {
        'content-type': 'image/jpeg',
        'cache-control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
        'content-disposition': 'inline; filename=og-image.jpg',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch {
    try {
      const fallbackBuf = await fetchDefaultOg(req.url)
      const out = await toSquareJpeg(fallbackBuf)
      return new NextResponse(new Uint8Array(out), {
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
          'cache-control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
          'content-disposition': 'inline; filename=og-image.jpg',
          'x-content-type-options': 'nosniff',
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown'
      return new NextResponse(`OG error: ${msg}`, { status: 500 })
    }
  }
}
