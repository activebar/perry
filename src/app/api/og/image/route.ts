// Path: src/app/api/og/image/route.ts
// Version: V27.2
// Updated: 2026-03-21 22:25
// Note: prioritize per-event OG image from uploads bucket at {event_id}/og/default.jpg, then fallback to media/post/gallery, then styled default

import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseServiceRole, getPublicUploadUrl } from '@/lib/supabase'
import { fetchSettings } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const SIZE = 630

const JPEG_HEADERS = {
  'content-type': 'image/jpeg',
  'cache-control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
  'content-disposition': 'inline; filename=og-image.jpg',
  'x-content-type-options': 'nosniff',
}

const sb = supabaseServiceRole()

function escapeXml(input: string) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function extractUploadsPathFromPublicUrl(url: string) {
  const m = String(url || '').match(/\/storage\/v1\/object\/public\/uploads\/(.+)$/i)
  return m?.[1] ? decodeURIComponent(m[1]) : null
}

function pickUrlFromRow(row: any) {
  const storagePath = String(row?.storage_path || '').trim()
  return (
    String(row?.thumb_url || '').trim() ||
    String(row?.public_url || '').trim() ||
    String(row?.url || '').trim() ||
    (storagePath ? getPublicUploadUrl(storagePath) : '')
  )
}

async function fetchRemoteBuffer(url: string) {
  const res = await fetch(url, { cache: 'no-store', redirect: 'follow' })
  if (!res.ok) throw new Error(`remote fetch failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function fetchUploadsBuffer(pathOrPublicUrl: string) {
  const uploadsPath =
    extractUploadsPathFromPublicUrl(pathOrPublicUrl) ||
    String(pathOrPublicUrl || '').replace(/^\/+/, '')

  const { data, error } = await sb.storage.from('uploads').download(uploadsPath)
  if (error || !data) throw new Error(error?.message || 'uploads download failed')

  return Buffer.from(await data.arrayBuffer())
}

async function uploadsFileExists(pathValue: string) {
  const clean = String(pathValue || '').replace(/^\/+/, '')
  if (!clean) return false

  const parts = clean.split('/')
  const fileName = parts.pop()
  const folder = parts.join('/')

  if (!fileName) return false

  const { data, error } = await sb.storage.from('uploads').list(folder, {
    limit: 200,
    search: fileName,
  })

  if (error || !data) return false
  return data.some((item: any) => String(item?.name || '') === fileName)
}

async function loadImageBufferFromUrl(url: string) {
  const normalized = String(url || '').trim()
  if (!normalized) throw new Error('empty image url')

  if (/\/storage\/v1\/object\/public\/uploads\//i.test(normalized)) {
    return fetchUploadsBuffer(normalized)
  }

  if (/^https?:\/\//i.test(normalized)) {
    return fetchRemoteBuffer(normalized)
  }

  return fetchUploadsBuffer(normalized)
}

async function squareJpegFromBuffer(input: Buffer) {
  return sharp(input)
    .rotate()
    .resize(SIZE, SIZE, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()
}

function buildFallbackSvg(title: string, subtitle: string) {
  const t = escapeXml(title)
  const s = escapeXml(subtitle)

  return Buffer.from(`
    <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="50%" stop-color="#111827"/>
          <stop offset="100%" stop-color="#1e293b"/>
        </linearGradient>
        <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#14b8a6" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="#0ea5e9" stop-opacity="0.10"/>
        </linearGradient>
      </defs>

      <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
      <rect x="32" y="32" width="${SIZE - 64}" height="${SIZE - 64}" rx="28" fill="url(#card)"/>
      <text x="50%" y="320" text-anchor="middle" font-size="48" font-family="Arial, sans-serif" fill="#ffffff" font-weight="700">${t}</text>
      <text x="50%" y="380" text-anchor="middle" font-size="22" font-family="Arial, sans-serif" fill="#dbeafe">${s}</text>
      <text x="50%" y="560" text-anchor="middle" font-size="20" font-family="Arial, sans-serif" fill="#cbd5e1">ActiveBar</text>
    </svg>
  `)
}

async function makeFallbackJpeg(title = 'אירוע', subtitle = 'תמונת שיתוף') {
  return sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 3,
      background: { r: 15, g: 23, b: 42 },
    },
  })
    .composite([{ input: buildFallbackSvg(title, subtitle), top: 0, left: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()
}

async function getEventTexts(eventId: string) {
  const cleanEvent = String(eventId || '').trim()
  if (!cleanEvent) {
    return { title: 'אירוע', subtitle: 'תמונת שיתוף' }
  }

  try {
    const s: any = await fetchSettings(cleanEvent)
    return {
      title: String(s?.event_name || cleanEvent).trim() || cleanEvent,
      subtitle:
        String(s?.share_gallery_description || '').trim() ||
        String(s?.meta_description || '').trim() ||
        'תמונת שיתוף',
    }
  } catch {
    return { title: cleanEvent, subtitle: 'תמונת שיתוף' }
  }
}

async function getEventImageUrl(eventId: string) {
  const cleanEvent = String(eventId || '').trim()
  if (!cleanEvent) return ''

  // 1) highest priority: fixed storage path per event
  const fixedPath = `${cleanEvent}/og/default.jpg`
  if (await uploadsFileExists(fixedPath)) {
    return getPublicUploadUrl(fixedPath)
  }

  // 2) settings fields if exist
  let settings: any = null
  try {
    settings = await fetchSettings(cleanEvent)
  } catch {
    settings = null
  }

  const settingsImage =
    String(settings?.og_image_url || '').trim() ||
    String(settings?.og_default_image_url || '').trim() ||
    String(settings?.share_image_url || '').trim() ||
    String(settings?.cover_image_url || '').trim()

  if (settingsImage) return settingsImage

  // 3) hero / cover block image
  const { data: heroBlock } = await sb
    .from('blocks')
    .select('config, type, is_visible, sort_order')
    .eq('event_id', cleanEvent)
    .eq('is_visible', true)
    .in('type', ['hero', 'cover', 'home'])
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()

  const heroImage =
    String((heroBlock as any)?.config?.image_url || '').trim() ||
    String((heroBlock as any)?.config?.bg_image_url || '').trim() ||
    String((heroBlock as any)?.config?.cover_image || '').trim()

  if (heroImage) return heroImage

  // 4) any approved event media
  const { data: latestApprovedMedia } = await sb
    .from('media_items')
    .select('thumb_url, public_url, url, storage_path')
    .eq('event_id', cleanEvent)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return pickUrlFromRow(latestApprovedMedia)
}

async function findMediaUrl(params: URLSearchParams) {
  const media = String(params.get('media') || '').trim()
  const post = String(params.get('post') || '').trim()
  const gallery = String(params.get('gallery') || '').trim()
  const fallback = String(params.get('fallback') || '').trim()
  const event = String(params.get('event') || '').trim()

  if (media) {
    const { data } = await sb
      .from('media_items')
      .select('thumb_url, public_url, url, storage_path')
      .or(`id.eq.${media},post_id.eq.${media}`)
      .limit(1)
      .maybeSingle()

    const mediaUrl = pickUrlFromRow(data)
    if (mediaUrl) return mediaUrl
  }

  if (post) {
    const { data } = await sb
      .from('posts')
      .select('media_url')
      .eq('id', post)
      .limit(1)
      .maybeSingle()

    const postUrl = String((data as any)?.media_url || '').trim()
    if (postUrl) return postUrl
  }

  if (gallery) {
    const { data } = await sb
      .from('media_items')
      .select('thumb_url, public_url, url, storage_path')
      .eq('gallery_id', gallery)
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const galleryUrl = pickUrlFromRow(data)
    if (galleryUrl) return galleryUrl
  }

  if (event) {
    const eventUrl = await getEventImageUrl(event)
    if (eventUrl) return eventUrl
  }

  if (fallback) return fallback

  return ''
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const params = url.searchParams
  const event = String(params.get('event') || '').trim()
  const forceDefault = params.get('default') === '1'

  try {
    const sourceUrl = forceDefault ? await getEventImageUrl(event) : await findMediaUrl(params)

    if (sourceUrl) {
      const input = await loadImageBufferFromUrl(sourceUrl)
      const out = await squareJpegFromBuffer(input)
      return new NextResponse(new Uint8Array(out), { status: 200, headers: JPEG_HEADERS })
    }

    const texts = await getEventTexts(event)
    const out = await makeFallbackJpeg(texts.title, texts.subtitle)
    return new NextResponse(new Uint8Array(out), { status: 200, headers: JPEG_HEADERS })
  } catch {
    const texts = await getEventTexts(event)
    const out = await makeFallbackJpeg(texts.title, texts.subtitle)
    return new NextResponse(new Uint8Array(out), { status: 200, headers: JPEG_HEADERS })
  }
}
