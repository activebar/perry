// src/app/api/og/image/route.ts
// Version: V26.0
// Updated: 2026-03-21 17:05

import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseServiceRole, getPublicUploadUrl } from '@/lib/supabase'
import { fetchSettings } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const OG_SIZE = 630
const sb = supabaseServiceRole()

function extractUploadsPathFromPublicUrl(u: string) {
  const m = u.match(/\/storage\/v1\/object\/public\/uploads\/(.+)$/)
  return m?.[1] || null
}

async function fetchImageBuffer(url: string) {
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error(`Failed to fetch image: ${r.status}`)
  const ab = await r.arrayBuffer()
  return Buffer.from(ab)
}

async function getPostByIdOrPrefix(post: string) {
  const byUuid = /^[0-9a-f-]{36}$/i.test(post)
  let q = sb
    .from('posts')
    .select('id, event_id, author_name, text, media_url, status, kind')
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
    .select('id, event_id, public_url, url, storage_path, mime_type, kind, post_id, gallery_id')
    .limit(1)

  if (byUuid) q = q.or(`id.eq.${media},post_id.eq.${media}`)
  else q = q.ilike('id', `${media}%`).order('created_at', { ascending: false })

  const { data, error } = await q.maybeSingle()
  if (error) throw error
  return data || null
}

async function loadBufferFromAnyUrl(url: string) {
  const uploadsPath = extractUploadsPathFromPublicUrl(url)
  if (uploadsPath) {
    const { data, error } = await sb.storage.from('uploads').download(uploadsPath)
    if (error) throw error
    return Buffer.from(await data.arrayBuffer())
  }
  return fetchImageBuffer(url)
}

async function toSquareJpeg(input: Buffer) {
  return await sharp(input)
    .rotate()
    .resize(OG_SIZE, OG_SIZE, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer()
}

async function buildDesignedCard(baseImage: Buffer, settings: any, eventName: string) {
  const base = await sharp(baseImage)
    .rotate()
    .resize(OG_SIZE, OG_SIZE, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer()

  const titleEnabled = settings?.share_title_enabled !== false
  const logoEnabled = settings?.share_logo_enabled !== false
  const logoUrl = String(settings?.share_logo_url || '').trim()
  const title = String(eventName || settings?.event_name || '').trim() || 'האירוע שלנו'

  const composites: sharp.OverlayOptions[] = []

  if (titleEnabled) {
    const svg = `
      <svg width="${OG_SIZE}" height="96" xmlns="http://www.w3.org/2000/svg">
        <rect x="12" y="12" rx="24" ry="24" width="${OG_SIZE - 24}" height="72" fill="rgba(255,255,255,0.88)"/>
        <text x="${OG_SIZE / 2}" y="58" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#111">🎉 ${title.replace(/&/g, '&amp;').replace(/</g, '&lt;')} 🎉</text>
      </svg>`
    composites.push({ input: Buffer.from(svg), top: 0, left: 0 })
  }

  if (logoEnabled && logoUrl) {
    try {
      const logoBuf = await loadBufferFromAnyUrl(logoUrl)
      const logoPng = await sharp(logoBuf)
        .rotate()
        .resize({ width: 160, height: 72, fit: 'inside' })
        .png()
        .toBuffer()

      const badgeSvg = `<svg width="190" height="88" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" rx="22" ry="22" width="190" height="88" fill="rgba(255,255,255,0.82)"/></svg>`
      composites.push({ input: Buffer.from(badgeSvg), left: 220, top: OG_SIZE - 108 })
      composites.push({ input: logoPng, left: 235, top: OG_SIZE - 100 })
    } catch {
      // ignore logo failures
    }
  }

  return await sharp(base).composite(composites).jpeg({ quality: 84, mozjpeg: true }).toBuffer()
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const defaultParam = url.searchParams.get('default')
  const post = url.searchParams.get('post')
  const media = url.searchParams.get('media')
  const fallback = url.searchParams.get('fallback')

  const eventSlugFromUrl = (url.searchParams.get('event') || '').trim()
  let eventSlug = eventSlugFromUrl || process.env.EVENT_SLUG || process.env.NEXT_PUBLIC_EVENT_SLUG || 'ido'

  try {
    let imageUrl: string | null = null
    let eventName = eventSlug

    if (post) {
      const p = await getPostByIdOrPrefix(post)
      if (p?.kind === 'blessing' && p?.status === 'approved') {
        imageUrl = p.media_url || null
        if (p.event_id) eventSlug = String(p.event_id)
      }
    }

    if (!imageUrl && media) {
      const m = await getMediaItemByIdOrPrefix(media)
      if (m) {
        imageUrl =
          String((m as any).public_url || '').trim() ||
          String((m as any).url || '').trim() ||
          ((m as any).storage_path ? getPublicUploadUrl((m as any).storage_path) : null)

        if ((m as any).event_id) eventSlug = String((m as any).event_id)
      }
    }

    const settings = await fetchSettings(eventSlug || undefined)
    eventName = String((settings as any)?.event_name || eventSlug)

    const defaultUrl =
      String((settings as any)?.og_default_image_url || '').trim() ||
      getPublicUploadUrl(`${eventSlug}/og/default.jpg`)

    if (!imageUrl && defaultParam) imageUrl = defaultUrl || null
    if (!imageUrl && fallback) imageUrl = fallback
    if (!imageUrl) imageUrl = defaultUrl || null
    if (!imageUrl) return new NextResponse('Missing OG image source', { status: 404 })

    const buf = await loadBufferFromAnyUrl(imageUrl)
    const style = String((settings as any)?.share_image_style || 'plain_square')
    const out =
      style === 'designed_card'
        ? await buildDesignedCard(buf, settings, eventName)
        : await toSquareJpeg(buf)

    return new NextResponse(new Uint8Array(out), {
      status: 200,
      headers: {
        'content-type': 'image/jpeg',
        'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    return new NextResponse(`OG error: ${msg}`, { status: 500 })
  }
}
