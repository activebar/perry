// Path: src/app/gl/[code]/page.tsx
// Version: V26.2
// Updated: 2026-03-21 10:20
// Note: fix short-link event resolution without ido fallback + normalize target_path + safer gallery title lookup

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

function normalizeTargetPath(input: string | null | undefined) {
  const raw = String(input || '').trim()
  if (!raw) return ''

  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw)
      return `${u.pathname || ''}${u.search || ''}${u.hash || ''}` || '/'
    } catch {
      return raw
    }
  }

  return raw.startsWith('/') ? raw : `/${raw}`
}

function extractGalleryIdFromTarget(targetPath: string | null) {
  if (!targetPath) return null
  const m = String(targetPath).match(/\/gallery\/([0-9a-f-]{36})/i)
  return m?.[1] || null
}

function extractEventSlugFromTarget(targetPath: string | null) {
  if (!targetPath) return ''
  const normalized = normalizeTargetPath(targetPath)
  const m = normalized.match(/^\/([^/?#]+)\/gallery(?:\/|$)/i)
  return String(m?.[1] || '').trim()
}

async function resolveTarget(code: string) {
  const srv = supabaseServiceRole()

  const { data } = await srv
    .from('short_links')
    .select('target_path, kind, media_item_id')
    .eq('code', code)
    .maybeSingle()

  if (!data) return null

  const mediaItemId = (data as any)?.media_item_id
    ? String((data as any).media_item_id).trim()
    : null

  return {
    target: normalizeTargetPath(String((data as any)?.target_path || '')),
    mediaItemId: mediaItemId || null,
  }
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

function absoluteUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path
  const b = baseUrl()
  if (!b) return path
  return `${b}${path.startsWith('/') ? path : `/${path}`}`
}

async function getEventSlugForGallery(galleryId: string, targetPath?: string | null) {
  const fromTarget = extractEventSlugFromTarget(targetPath || null)
  if (fromTarget) return fromTarget

  const srv = supabaseServiceRole()

  const { data: g } = await srv
    .from('galleries')
    .select('event_id')
    .eq('id', galleryId)
    .maybeSingle()

  const fromGallery = String((g as any)?.event_id || '').trim()
  if (fromGallery) return fromGallery

  const { data: miApproved } = await srv
    .from('media_items')
    .select('event_id, created_at')
    .eq('gallery_id', galleryId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const fromApprovedMedia = String((miApproved as any)?.event_id || '').trim()
  if (fromApprovedMedia) return fromApprovedMedia

  const { data: miAny } = await srv
    .from('media_items')
    .select('event_id, created_at')
    .eq('gallery_id', galleryId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return String((miAny as any)?.event_id || '').trim()
}

async function getGalleryDisplayTitle(galleryId: string, eventSlug: string, fallbackTitle = 'גלריה') {
  const srv = supabaseServiceRole()

  const { data: g } = await srv
    .from('galleries')
    .select('id,title,event_id')
    .eq('id', galleryId)
    .maybeSingle()

  const galleryEventSlug = String((g as any)?.event_id || '').trim()
  let title = String((g as any)?.title || fallbackTitle).trim() || fallbackTitle

  const searchEventIds = Array.from(
    new Set([eventSlug, galleryEventSlug].map(x => String(x || '').trim()).filter(Boolean))
  )

  if (!searchEventIds.length) {
    return title
  }

  for (const eid of searchEventIds) {
    const { data } = await srv
      .from('blocks')
      .select('event_id,type,config,is_visible,sort_order,order_index')
      .eq('event_id', eid)
      .eq('is_visible', true)
      .or('type.eq.gallery,type.like.gallery_%')
      .order('sort_order', { ascending: true })
      .order('order_index', { ascending: true })

    const rows = (data as any[]) || []
    for (const row of rows) {
      const cfg = (row as any)?.config || {}
      const cfgGalleryId = String(cfg?.gallery_id || cfg?.galleryId || '').trim()
      const cfgTitle = String(cfg?.title || cfg?.display_title || '').trim()
      if (cfgGalleryId && cfgGalleryId === galleryId && cfgTitle) {
        return cfgTitle
      }
    }
  }

  return title
}

async function getOgForMedia(mediaItemId: string, targetPath?: string | null) {
  const srv = supabaseServiceRole()

  const { data: mi } = await srv
    .from('media_items')
    .select('id, gallery_id, event_id, updated_at, created_at')
    .eq('id', mediaItemId)
    .maybeSingle()

  const mediaEventSlug = String((mi as any)?.event_id || '').trim()
  const targetEventSlug = extractEventSlugFromTarget(targetPath || null)
  const eventSlug = mediaEventSlug || targetEventSlug

  const settings = eventSlug
    ? await fetchSettings(eventSlug).catch(() => null)
    : null

  let galleryTitle = 'תמונה'
  if ((mi as any)?.gallery_id) {
    galleryTitle = await getGalleryDisplayTitle(String((mi as any).gallery_id), eventSlug, 'תמונה')
  }

  const eventName =
    String((settings as any)?.event_name || '').trim() ||
    eventSlug ||
    'אירוע'

  const description =
    String((settings as any)?.share_gallery_description || '').trim() ||
    'לחצו לצפייה בתמונה'

  const versionKey = encodeURIComponent(
    String((mi as any)?.updated_at || (mi as any)?.created_at || mediaItemId)
  )

  const ogImage = absoluteUrl(
    `/api/og/image?media=${encodeURIComponent(String(mediaItemId))}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ''}&v=${versionKey}`
  )

  return { eventName, galleryTitle, description, ogImage, eventSlug }
}

async function getOgForGallery(galleryId: string, targetPath?: string | null) {
  const srv = supabaseServiceRole()

  const { data: mi } = await srv
    .from('media_items')
    .select('id, event_id, updated_at, created_at, is_approved')
    .eq('gallery_id', galleryId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const mediaEventSlug = String((mi as any)?.event_id || '').trim()
  const eventSlug =
    mediaEventSlug ||
    (await getEventSlugForGallery(galleryId, targetPath))

  const settings = eventSlug
    ? await fetchSettings(eventSlug).catch(() => null)
    : null

  const eventName =
    String((settings as any)?.event_name || '').trim() ||
    eventSlug ||
    'אירוע'

  const galleryTitle = await getGalleryDisplayTitle(galleryId, eventSlug, 'גלריה')

  const description =
    String((settings as any)?.share_gallery_description || '').trim() ||
    'לחצו לצפייה בתמונה'

  const versionKey = encodeURIComponent(
    String((mi as any)?.updated_at || (mi as any)?.created_at || galleryId)
  )

  const ogImage = mi?.id
    ? absoluteUrl(`/api/og/image?media=${encodeURIComponent(String(mi.id))}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ''}&v=${versionKey}`)
    : absoluteUrl(`/api/og/image?default=1${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ''}&v=${versionKey}`)

  return { eventName, galleryTitle, description, ogImage, eventSlug }
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const code = cleanCode(params.code)
  if (!code) return {}

  const resolved = await resolveTarget(code)
  if (!resolved) return {}

  const pageUrl = absoluteUrl(`/gl/${encodeURIComponent(code)}`)
  const b = baseUrl()

  if (resolved.mediaItemId) {
    const { eventName, galleryTitle, description, ogImage } = await getOgForMedia(
      resolved.mediaItemId,
      resolved.target
    )

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

  const { eventName, galleryTitle, description, ogImage } = await getOgForGallery(
    galleryId,
    resolved.target
  )

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

  const href = resolved.mediaItemId
    ? `/media/${encodeURIComponent(resolved.mediaItemId)}`
    : normalizeTargetPath(resolved.target)

  if (!href) notFound()

  return (
    <main dir="rtl" className="mx-auto max-w-md p-6 text-center">
      <meta httpEquiv="refresh" content={`0;url=${href}`} />
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
