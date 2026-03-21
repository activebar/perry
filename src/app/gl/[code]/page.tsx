// Path: src/app/gl/[code]/page.tsx
// Version: V26.6
// Updated: 2026-03-21 20:20
// Note: stable GL short-link resolver + correct gallery title from blocks + absolute OG URLs without unsafe fallbacks

import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { supabaseServiceRole } from '@/lib/supabase'
import { fetchSettings } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type ShortLinkRow = {
  target_path?: string | null
  kind?: string | null
  media_item_id?: string | null
}

function cleanCode(input: string) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z]/g, '')
}

function normalizeTargetPath(targetPath: string | null | undefined) {
  const raw = String(targetPath || '').trim()
  if (!raw) return ''

  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw)
      return `${u.pathname}${u.search}${u.hash}` || ''
    }
  } catch {
    // ignore and fall through
  }

  return raw.startsWith('/') ? raw : `/${raw}`
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

function extractGalleryIdFromTarget(targetPath: string | null | undefined) {
  const normalized = normalizeTargetPath(targetPath)
  if (!normalized) return null
  const m = normalized.match(/\/gallery\/([0-9a-f-]{36})/i)
  return m?.[1] || null
}

function extractEventSlugFromTarget(targetPath: string | null | undefined) {
  const normalized = normalizeTargetPath(targetPath)
  if (!normalized) return null

  const parts = normalized.split('/').filter(Boolean)
  if (parts.length >= 3 && parts[1] === 'gallery') {
    return parts[0] || null
  }

  return null
}

async function resolveTarget(code: string) {
  const srv = supabaseServiceRole()

  const first = await srv
    .from('short_links')
    .select('target_path, kind, media_item_id')
    .eq('code', code)
    .maybeSingle()

  const firstData = first.data as ShortLinkRow | null

  if (firstData) {
    const mediaItemId = firstData.media_item_id ? String(firstData.media_item_id) : null
    const target = String(firstData.target_path || '')

    if (mediaItemId || target) {
      return {
        target,
        mediaItemId,
      }
    }
  }

  const second = await srv
    .from('short_links')
    .select('target_path')
    .eq('code', code)
    .maybeSingle()

  const secondTarget = String((second.data as { target_path?: string | null } | null)?.target_path || '')
  if (!secondTarget) return null

  return {
    target: secondTarget,
    mediaItemId: null as string | null,
  }
}

async function getDisplayGalleryTitleForGallery(galleryId: string, eventSlug?: string | null) {
  const srv = supabaseServiceRole()

  if (eventSlug) {
    const { data: blocks } = await srv
      .from('blocks')
      .select('config, is_visible')
      .eq('event_id', eventSlug)
      .eq('is_visible', true)

    const match = (blocks || []).find(
      (b: any) => String(b?.config?.gallery_id || '') === String(galleryId)
    )

    const matchedTitle = String(match?.config?.title || '').trim()
    if (matchedTitle) return matchedTitle
  }

  const { data: gallery } = await srv
    .from('galleries')
    .select('id, title')
    .eq('id', galleryId)
    .maybeSingle()

  return String((gallery as any)?.title || 'גלריה').trim() || 'גלריה'
}

async function getOgForMedia(mediaItemId: string, code: string) {
  const srv = supabaseServiceRole()

  const { data: mi } = await srv
    .from('media_items')
    .select('id, gallery_id, event_id')
    .eq('id', mediaItemId)
    .maybeSingle()

  const media = mi as any
  const eventSlug =
    String(media?.event_id || '').trim() ||
    extractEventSlugFromTarget(null)

  const settings = eventSlug ? await fetchSettings(eventSlug) : await fetchSettings()
  const galleryTitle = media?.gallery_id
    ? await getDisplayGalleryTitleForGallery(String(media.gallery_id), eventSlug || null)
    : 'תמונה'

  const eventName = String((settings as any)?.event_name || 'אירוע').trim() || 'אירוע'
  const description =
    String((settings as any)?.share_gallery_description || '').trim() || 'לחצו לצפייה בתמונה'

  const b = baseUrl()
  const ogImage = `${b}/api/og/image?media=${encodeURIComponent(mediaItemId)}&v=${encodeURIComponent(code)}`

  return { eventName, galleryTitle, description, ogImage }
}

async function getOgForGallery(galleryId: string, code: string, targetPath?: string | null) {
  const srv = supabaseServiceRole()

  let eventSlug = extractEventSlugFromTarget(targetPath)

  if (!eventSlug) {
    const { data: anyMedia } = await srv
      .from('media_items')
      .select('event_id')
      .eq('gallery_id', galleryId)
      .not('event_id', 'is', null)
      .limit(1)
      .maybeSingle()

    eventSlug = String((anyMedia as any)?.event_id || '').trim() || null
  }

  const settings = eventSlug ? await fetchSettings(eventSlug) : await fetchSettings()
  const galleryTitle = await getDisplayGalleryTitleForGallery(galleryId, eventSlug)

  const eventName = String((settings as any)?.event_name || 'אירוע').trim() || 'אירוע'
  const description =
    String((settings as any)?.share_gallery_description || '').trim() || 'לחצו לצפייה בגלריה והעלאת תמונות'

  const { data: latestMedia } = await srv
    .from('media_items')
    .select('id')
    .eq('gallery_id', galleryId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const b = baseUrl()
  const ogImage = (latestMedia as any)?.id
    ? `${b}/api/og/image?media=${encodeURIComponent(String((latestMedia as any).id))}&v=${encodeURIComponent(code)}`
    : `${b}/api/og/image?default=1&v=${encodeURIComponent(code)}`

  return { eventName, galleryTitle, description, ogImage }
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const code = cleanCode(params.code)
  if (!code) return {}

  const resolved = await resolveTarget(code)
  if (!resolved) return {}

  const b = baseUrl()
  const pageUrl = `${b}/gl/${encodeURIComponent(code)}`

  if (resolved.mediaItemId) {
    const { eventName, galleryTitle, description, ogImage } = await getOgForMedia(resolved.mediaItemId, code)
    const title = `${eventName} · ${galleryTitle}`

    return {
      metadataBase: new URL(b),
      title,
      description,
      alternates: { canonical: pageUrl },
      openGraph: {
        title,
        description,
        type: 'website',
        url: pageUrl,
        locale: 'he_IL',
        images: [
          {
            url: ogImage,
            width: 630,
            height: 630,
            alt: galleryTitle,
          },
        ],
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

  const { eventName, galleryTitle, description, ogImage } = await getOgForGallery(
    galleryId,
    code,
    resolved.target
  )
  const title = `${eventName} · ${galleryTitle}`

  return {
    metadataBase: new URL(b),
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title,
      description,
      type: 'website',
      url: pageUrl,
      locale: 'he_IL',
      images: [
        {
          url: ogImage,
          width: 630,
          height: 630,
          alt: galleryTitle,
        },
      ],
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
  const href =
    normalizedTarget ||
    (resolved.mediaItemId ? `/media/${encodeURIComponent(resolved.mediaItemId)}` : '')

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
