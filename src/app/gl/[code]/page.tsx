// Path: src/app/gl/[code]/page.tsx
// Version: V26.5
// Updated: 2026-03-21 20:20
// Note: fix TypeScript build errors + stable OG metadata + safe gallery title resolution

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
  const raw = String(targetPath)
  const pathOnly = raw.replace(/^https?:\/\/[^/]+/i, '')
  const m = pathOnly.match(/\/gallery\/([0-9a-f-]{36})/i)
  return m?.[1] || null
}

function extractEventSlugFromTarget(targetPath: string | null) {
  if (!targetPath) return null
  const raw = String(targetPath)
  const pathOnly = raw.replace(/^https?:\/\/[^/]+/i, '')
  const m = pathOnly.match(/^\/([^/]+)\/gallery(?:\/|$)/i)
  return m?.[1] ? decodeURIComponent(m[1]) : null
}

function normalizeTargetPath(targetPath: string | null) {
  if (!targetPath) return ''
  const raw = String(targetPath).trim()
  if (!raw) return ''
  return raw.replace(/^https?:\/\/[^/]+/i, '') || ''
}

async function resolveTarget(code: string) {
  const srv = supabaseServiceRole()

  const first = await srv
    .from('short_links')
    .select('target_path, kind, media_item_id')
    .eq('code', code)
    .maybeSingle()

  if (first.data) {
    const target = String((first.data as any).target_path || '').trim()
    const mediaItemId = (first.data as any).media_item_id ? String((first.data as any).media_item_id) : null
    return { target, mediaItemId }
  }

  const second = await srv
    .from('short_links')
    .select('target_path')
    .eq('code', code)
    .maybeSingle()

  if (second.data) {
    return { target: String((second.data as any).target_path || '').trim(), mediaItemId: null }
  }

  return null
}

async function getDisplayGalleryTitleForGallery(galleryId: string, eventSlug?: string | null) {
  const srv = supabaseServiceRole()

  let resolvedEventSlug = String(eventSlug || '').trim()
  let galleryTitle = 'גלריה'

  if (!resolvedEventSlug) {
    const { data: galleryRow } = await srv
      .from('galleries')
      .select('id, title, event_id')
      .eq('id', galleryId)
      .maybeSingle()

    galleryTitle = String((galleryRow as any)?.title || '').trim() || galleryTitle
    resolvedEventSlug = String((galleryRow as any)?.event_id || '').trim()
  } else {
    const { data: galleryRow } = await srv
      .from('galleries')
      .select('id, title')
      .eq('id', galleryId)
      .maybeSingle()

    galleryTitle = String((galleryRow as any)?.title || '').trim() || galleryTitle
  }

  if (!resolvedEventSlug) {
    const { data: mediaRow } = await srv
      .from('media_items')
      .select('event_id')
      .eq('gallery_id', galleryId)
      .not('event_id', 'is', null)
      .limit(1)
      .maybeSingle()

    resolvedEventSlug = String((mediaRow as any)?.event_id || '').trim()
  }

  if (resolvedEventSlug) {
    const { data: blocks } = await srv
      .from('blocks')
      .select('config')
      .eq('event_id', resolvedEventSlug)
      .eq('is_visible', true)

    const match = (blocks || []).find(
      (b: any) => String(b?.config?.gallery_id || '').trim() === galleryId
    )

    const matchedTitle = String(match?.config?.title || '').trim()
    if (matchedTitle) {
      galleryTitle = matchedTitle
    }
  }

  return { galleryTitle, eventSlug: resolvedEventSlug }
}

async function getOgForMedia(mediaItemId: string) {
  const srv = supabaseServiceRole()

  const { data: mi } = await srv
    .from('media_items')
    .select('id, gallery_id, event_id')
    .eq('id', mediaItemId)
    .maybeSingle()

  let eventSlug = String((mi as any)?.event_id || '').trim()
  const galleryId = String((mi as any)?.gallery_id || '').trim()

  const titleInfo = galleryId
    ? await getDisplayGalleryTitleForGallery(galleryId, eventSlug || null)
    : { galleryTitle: 'תמונה', eventSlug }

  eventSlug = String(titleInfo.eventSlug || eventSlug || '').trim()

  let eventName = eventSlug || 'אירוע'
  let description = 'לחצו לצפייה בתמונה'

  if (eventSlug) {
    const settings = await fetchSettings(eventSlug).catch(() => null)
    eventName = String((settings as any)?.event_name || '').trim() || eventName
    description = String((settings as any)?.share_gallery_description || '').trim() || description
  }

  const b = baseUrl()
  const ogImage = `${b}/api/og/image?media=${encodeURIComponent(String(mediaItemId))}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ''}&v=${Date.now()}`

  return {
    eventName,
    galleryTitle: String(titleInfo.galleryTitle || 'תמונה').trim() || 'תמונה',
    description,
    ogImage,
  }
}

async function getOgForGallery(galleryId: string, targetPath?: string | null) {
  const eventSlugFromTarget = extractEventSlugFromTarget(targetPath || null)
  const titleInfo = await getDisplayGalleryTitleForGallery(galleryId, eventSlugFromTarget)
  const eventSlug = String(titleInfo.eventSlug || eventSlugFromTarget || '').trim()

  let eventName = eventSlug || 'אירוע'
  let description = 'לחצו לצפייה בגלריה והעלאת תמונות'

  if (eventSlug) {
    const settings = await fetchSettings(eventSlug).catch(() => null)
    eventName = String((settings as any)?.event_name || '').trim() || eventName
    description = String((settings as any)?.share_gallery_description || '').trim() || description
  }

  const srv = supabaseServiceRole()
  const { data: mi } = await srv
    .from('media_items')
    .select('id')
    .eq('gallery_id', galleryId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const b = baseUrl()
  const ogImage = mi?.id
    ? `${b}/api/og/image?media=${encodeURIComponent(String(mi.id))}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ''}&v=${Date.now()}`
    : `${b}/api/og/image?default=1${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ''}&v=${Date.now()}`

  return {
    eventName,
    galleryTitle: String(titleInfo.galleryTitle || 'גלריה').trim() || 'גלריה',
    description,
    ogImage,
  }
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const code = cleanCode(params.code)
  if (!code) return {}

  const resolved = await resolveTarget(code)
  if (!resolved) return {}

  const b = baseUrl()
  const pageUrl = `${b}/gl/${encodeURIComponent(code)}`

  if (resolved.mediaItemId) {
    const { eventName, galleryTitle, description, ogImage } = await getOgForMedia(resolved.mediaItemId)
    const title = `${eventName} · ${galleryTitle}`

    return {
      metadataBase: b ? new URL(b) : undefined,
      title,
      description,
      alternates: { canonical: pageUrl },
      openGraph: {
        title,
        description,
        url: pageUrl,
        type: 'website',
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

  const { eventName, galleryTitle, description, ogImage } = await getOgForGallery(galleryId, resolved.target)
  const title = `${eventName} · ${galleryTitle}`

  return {
    metadataBase: b ? new URL(b) : undefined,
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title,
      description,
      url: pageUrl,
      type: 'website',
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
