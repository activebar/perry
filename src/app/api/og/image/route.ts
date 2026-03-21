// Path: src/app/api/og/image/route.ts
// Version: V26.9
// Updated: 2026-03-21 21:20
// Note: rebuilt from scratch - stable square OG image route with internal fallback and no recursive dependency

import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseServiceRole, getPublicUploadUrl } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const SIZE = 630
const JPEG_HEADERS = {
  'content-type': 'image/jpeg',
  'cache-control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
  'content-disposition': 'inline; filename=og-image.jpg',
  'x-content-type-options': 'nosniff',
}

function svgText(title: string, subtitle: string) {
  const safeTitle = String(title || '').replace(/[<>&"]/g, '')
  const safeSubtitle = String(subtitle || '').replace(/[<>&"]/g, '')
  return Buffer.from(`
    <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#111827"/>
          <stop offset="100%" stop-color="#000000"/>
        </linearGradient>
      </defs>
      <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
      <circle cx="315" cy="200" r="82" fill="#ffffff" fill-opacity="0.08"/>
      <text x="50%" y="53%" text-anchor="middle" font-size="52" font-family="Arial, sans-serif" fill="#ffffff" font-weight="700">${safeTitle}</text>
      <text x="50%" y="62%" text-anchor="middle" font-size="24" font-family="Arial, sans-serif" fill="#d4d4d8">${safeSubtitle}</text>
    </svg>
  `)
}

async function makeFallbackJpeg(title = 'ActiveBar', subtitle = 'Event Photo') {
  return sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 3,
      background: { r: 10, g: 10, b: 10 },
    },
  })
    .composite([{ input: svgText(title, subtitle), top: 0, left: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()
}

function extractUploadsPathFromPublicUrl(url: string) {
  const m = String(url || '').match(/\/storage\/v1\/object\/public\/uploads\/(.+)$/i)
  return m?.[1] ? decodeURIComponent(m[1]) : null
}

async function fetchRemoteBuffer(url: string) {
  const res = await fetch(url, { cache: 'no-store', redirect: 'follow' })
  if (!res.ok) throw new Error(`remote fetch failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function fetchUploadsBuffer(pathOrPublicUrl: string) {
  const uploadsPath = extractUploadsPathFromPublicUrl(pathOrPublicUrl) || String(pathOrPublicUrl || '').replace(/^\/+/, '')
  const sb = supabaseServiceRole()
  const { data, error } = await sb.storage.from('uploads').download(uploadsPath)
  if (error || !data) throw new Error(error?.message || 'uploads download failed')
  return Buffer.from(await data.arrayBuffer())
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

function pickUrlFromRow(row: any) {
  const storagePath = String(row?.storage_path || '').trim()
  return (
    String(row?.thumb_url || '').trim() ||
    String(row?.public_url || '').trim() ||
    String(row?.url || '').trim() ||
    (storagePath ? getPublicUploadUrl(storagePath) : '')
  )
}

async function findMediaUrl(params: URLSearchParams) {
  const sb = supabaseServiceRole()

  const media = String(params.get('media') || '').trim()
  const post = String(params.get('post') || '').trim()
  const gallery = String(params.get('gallery') || '').trim()
  const fallback = String(params.get('fallback') || '').trim()

  if (fallback) return fallback

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

  return ''
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const sourceUrl = await findMediaUrl(url.searchParams)

    if (!sourceUrl || url.searchParams.get('default') === '1') {
      const out = await makeFallbackJpeg()
      return new NextResponse(new Uint8Array(out), { status: 200, headers: JPEG_HEADERS })
    }

    const input = await loadImageBufferFromUrl(sourceUrl)
    const out = await squareJpegFromBuffer(input)

    return new NextResponse(new Uint8Array(out), { status: 200, headers: JPEG_HEADERS })
  } catch {
    const out = await makeFallbackJpeg()
    return new NextResponse(new Uint8Array(out), { status: 200, headers: JPEG_HEADERS })
  }
}
