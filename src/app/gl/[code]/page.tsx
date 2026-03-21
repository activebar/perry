// Path: src/app/gl/[code]/page.tsx
// Version: V26.3
// Updated: 2026-03-21 20:05
// Note: resolve gallery/media event correctly, use square OG route consistently, and prefer block display title over generic gallery names

import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { supabaseServiceRole } from '@/lib/supabase'
import { fetchSettings } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function cleanCode(input: string) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z]/g, '')
}

function normalizeTargetPath(targetPath: string | null | undefined) {
  const raw = String(targetPath || '').trim()
  if (!raw) return ''

  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw)
      return `${u.pathname}${u.search}${u.hash}` || ''
    } catch {
      return raw
    }
  }

  return raw.startsWith('/') ? raw : `/${raw}`
}

async function resolveTarget(code: string) {
  const srv = supabaseServiceRole()

  const first = await srv
    .from('short_links')
    .select('target_path, kind, media_item_id')
    .eq('code', code)
    .maybeSingle()

  if (first.data) {
    const data = first.data as any
    return {
      target: normalizeTargetPath(String(data.target_path || '')),
      kind: String(data.kind || '').trim(),
      mediaItemId: data.media_item_id ? String(data.media_item_id) : null,
    }
  }

  const second = await srv.from('short_links').select('target_path').eq('code', code).maybeSingle()
  if ((second.data as any)?.target_path) {
    return {
      target: normalizeTargetPath(String((second.data as any).target_path)),
      kind: '',
      mediaItemId: null,
    }
  }

  return null
}

function baseUrlFromHeaders() {
  const h = headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'https'
  return host ? `${proto}://${host}`.replace(/\/$/, '') : ''
}

function baseUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/$/, '')

  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`.replace(/\/$/, '')

  return baseUrlFromHeaders()
}

function extractGalleryIdFromTarget(targetPath: string | null) {
  if (!targetPath) return null
  const m = String(targetPath).match(/\/gallery\/([0-9a-f-]{36})/i)
  return m?.[1] || null
}

function extractEventSlugFromTarget(targetPath: string | null) {
  if (!targetPath) return null
  const m = String(targetPath).match(/^\/([^/]+)\/gallery(?:\/|$)/i)
  return m?.[1] ? decodeURIComponent(m[1]) : null
}

async function resolveGalleryContext(galleryId: string, hintedEventSlug?: string | null) {
  const srv = supabaseServiceRole()

  const { data: gallery } = await srv
    .from('galleries')
    .select('id, title, event_id')
    .eq('id', galleryId)
    .maybeSingle()

  let eventSlug = String(hintedEventSlug || (gallery as any)?.event_id || '').trim()

  if (!eventSlug) {
    const { data: mediaFromGallery } = await srv
      .from('media_items')
      .select('event_id')
      .eq('gallery_id', galleryId)
      .not('event_id', 'is', null)
      .limit(1)
      .maybeSingle()

    eventSlug = String((mediaFromGallery as any)?.event_id || '').trim()
  }

  let blockTitle = ''
  if (eventSlug) {
    const { data: blocks } = await srv
      .from('blocks')
      .select('config, is_visible, event_id')
      .eq('event_id', eventSlug)
      .eq('is_visible', true)

    const match = (blocks || []).find((b: any) => {
      const cfgGalleryId = String((b as any)?.config?.gallery_id || '').trim()
      return cfgGalleryId === galleryId
    })

    blockTitle = String((match as any)?.config?.title || '').trim()
  }

  const galleryTitle = blockTitle || String((gallery as any)?.title || '').trim() || 'גלריה'

  return {
    eventSlug,
    galleryTitle,
    gallery,
  }
}

async function resolveMediaContext(mediaItemId: string) {
  const srv = supabaseServiceRole()

  const { data: mi } = await srv
    .from('media_items')
    .select('id, gallery_id, event_id')
    .eq('id', mediaItemId)
    .maybeSingle()

  if (!mi) return null

  const galleryId = String((mi as any)?.gallery_id || '').trim() || null
  const directEventSlug = String((mi as any)?.event_id || '').trim()

  let galleryTitle = 'תמונה'
  let eventSlug = directEventSlug

  if (galleryId) {
    const galleryCtx = await resolveGalleryContext(galleryId, directEventSlug || null)
    if (galleryCtx.eventSlug) eventSlug = galleryCtx.eventSlug
    if (galleryCtx.galleryTitle) galleryTitle = galleryCtx.galleryTitle
  }

  return {
    media: mi,
    eventSlug,
    galleryId,
    galleryTitle,
  }
}

async function getOgForMedia(mediaItemId: string) {
  const mediaCtx = await resolveMediaContext(mediaItemId)
  if (!mediaCtx) {
    return {
      eventName: 'אירוע',
      galleryTitle: 'תמונה',
      description: 'לחצו לצפייה בתמונה',
      ogImage: `${baseUrl()}/api/og/image?media=${encodeURIComponent(mediaItemId)}&v=${Date.now()}`,
    }
  }

  const settings = mediaCtx.eventSlug ? await fetchSettings(mediaCtx.eventSlug).catch(() => null) : null
  const eventName = String((settings as any)?.event_name || mediaCtx.eventSlug || 'אירוע')
  const description = String((settings as any)?.share_gallery_description || '').trim() || 'לחצו לצפייה בתמונה'
  const ogImage = `${baseUrl()}/api/og/image?media=${encodeURIComponent(mediaItemId)}${mediaCtx.eventSlug ? `&event=${encodeURIComponent(mediaCtx.eventSlug)}` : ''}&v=${encodeURIComponent(mediaItemId.slice(0, 8))}`

  return { eventName, galleryTitle: mediaCtx.galleryTitle, description, ogImage }
}

async function getOgForGallery(galleryId: string, hintedEventSlug?: string | null) {
  const srv = supabaseServiceRole()
  const galleryCtx = await resolveGalleryContext(galleryId, hintedEventSlug || null)
  const settings = galleryCtx.eventSlug ? await fetchSettings(galleryCtx.eventSlug).catch(() => null) : null

  const { data: mi } = await srv
    .from('media_items')
    .select('id')
    .eq('gallery_id', galleryId)
    .eq('is_approved', true)
    .in('kind', ['gallery', 'galleries', 'video', 'gallery_video'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const eventName = String((settings as any)?.event_name || galleryCtx.eventSlug || 'אירוע')
  const galleryTitle = galleryCtx.galleryTitle
  const description = String((settings as any)?.share_gallery_description || '').trim() || 'לחצו לצפייה בגלריה והעלאת תמונות'
  const ogImage = mi?.id
    ? `${baseUrl()}/api/og/image?media=${encodeURIComponent(String(mi.id))}${galleryCtx.eventSlug ? `&event=${encodeURIComponent(galleryCtx.eventSlug)}` : ''}&v=${encodeURIComponent(String(mi.id).slice(0, 8))}`
    : `${baseUrl()}/api/og/image?default=1${galleryCtx.eventSlug ? `&event=${encodeURIComponent(galleryCtx.eventSlug)}` : ''}&v=${encodeURIComponent(galleryId.slice(0, 8))}`

  return { eventName, galleryTitle, description, ogImage }
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const code = cleanCode(params.code)
  if (!code) return {}

  const resolved = await resolveTarget(code)
  if (!resolved) return {}

  const canonical = `${baseUrl()}/gl/${encodeURIComponent(code)}`

  if (resolved.mediaItemId) {
    const { eventName, galleryTitle, description, ogImage } = await getOgForMedia(resolved.mediaItemId)
    const title = `${eventName} · ${galleryTitle}`

    return {
      metadataBase: baseUrl() ? new URL(baseUrl()) : undefined,
      title,
      description,
      alternates: { canonical },
      openGraph: {
        title,
        description,
        type: 'website',
        url: canonical,
        locale: 'he_IL',
        images: [{ url: ogImage, width: 630, height: 630, alt: title }],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [ogImage],
      },
    }
  }

  const galleryId = extractGalleryIdFromTarget(resolved.target)
  if (!galleryId) return {}

  const hintedEventSlug = extractEventSlugFromTarget(resolved.target)
  const { eventName, galleryTitle, description, ogImage } = await getOgForGallery(galleryId, hintedEventSlug)
  const title = `${eventName} · ${galleryTitle}`

  return {
    metadataBase: baseUrl() ? new URL(baseUrl()) : undefined,
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonical,
      locale: 'he_IL',
      images: [{ url: ogImage, width: 630, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  }
}

export default async function ShortGLLinkPage({ params }: { params: { code: string } }) {
  const code = cleanCode(params.code)
  if (!code) notFound()

  const resolved = await resolveTarget(code)
  if (!resolved) notFound()

  const normalizedTarget = normalizeTargetPath(resolved.target)
  const href = normalizedTarget || (resolved.mediaItemId ? `/media/${encodeURIComponent(resolved.mediaItemId)}` : '')

  if (!href) notFound()

  return (
    <main dir="rtl" className="mx-auto max-w-md p-6 text-center">
      <p className="text-sm text-zinc-600">מעבירים אותך לתמונה…</p>
      <a className="mt-3 inline-block rounded-full border px-4 py-2 text-sm no-underline" href={href}>
        אם לא עברת אוטומטית — לחץ כאן
      </a>

      <script
        dangerouslySetInnerHTML={{
          __html: `setTimeout(function(){ window.location.href = ${JSON.stringify(href)}; }, 60);`,
        }}
      />
    </main>
  )
}
