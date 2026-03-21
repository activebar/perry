// Path: src/app/gl/[code]/page.tsx
// Version: V26.4
// Updated: 2026-03-21 19:35
// Note: force absolute OG/Twitter image URL through square OG route for X/WhatsApp + keep short-link redirect stable

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

async function resolveTarget(code: string) {
  const srv = supabaseServiceRole()

  const first = await srv
    .from('short_links')
    .select('target_path, kind, media_item_id')
    .eq('code', code)
    .maybeSingle()

  if (first.data) {
    const mi = (first.data as any).media_item_id ? String((first.data as any).media_item_id) : null
    if (mi) return { target: String((first.data as any).target_path || ''), mediaItemId: mi }
    if ((first.data as any)?.target_path) {
      return { target: String((first.data as any).target_path), mediaItemId: null }
    }
  }

  const second = await srv.from('short_links').select('target_path').eq('code', code).maybeSingle()
  return (second.data as any)?.target_path ? { target: String((second.data as any).target_path), mediaItemId: null } : null
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
  const normalized = String(targetPath)
  const m = normalized.match(/\/gallery\/([0-9a-f-]{36})/i)
  return m?.[1] || null
}

function normalizeTargetPath(targetPath: string | null) {
  const value = String(targetPath || '').trim()
  if (!value) return ''
  try {
    const u = new URL(value)
    return `${u.pathname}${u.search}${u.hash}`
  } catch {
    return value.startsWith('/') ? value : `/${value}`
  }
}

async function getEventName(eventSlug: string) {
  const settings = await fetchSettings(eventSlug).catch(() => null)
  return String((settings as any)?.event_name || '').trim() || eventSlug || 'אירוע'
}

async function getDisplayGalleryTitleForMedia(mediaItemId: string) {
  const srv = supabaseServiceRole()
  const { data: mi } = await srv
    .from('media_items')
    .select('id, event_id, gallery_id')
    .eq('id', mediaItemId)
    .maybeSingle()

  const galleryId = String((mi as any)?.gallery_id || '').trim()
  const eventSlug = String((mi as any)?.event_id || '').trim()

  if (!galleryId) return { galleryTitle: 'תמונה', eventSlug }

  const { data: gallery } = await srv
    .from('galleries')
    .select('id, title')
    .eq('id', galleryId)
    .maybeSingle()

  let galleryTitle = String((gallery as any)?.title || '').trim() || 'תמונה'

  if (eventSlug) {
    const { data: blocks } = await srv
      .from('blocks')
      .select('config, is_visible, sort_order')
      .eq('event_id', eventSlug)
      .eq('is_visible', true)
      .order('sort_order', { ascending: true })

    const match = (blocks || []).find(
  (b: any) => String(b?.config?.gallery_id || '') === galleryId
)

const matchedTitle = String(match?.config?.title || '').trim()
if (matchedTitle) {
  galleryTitle = matchedTitle
}
  }

  return { galleryTitle, eventSlug }
}

async function getDisplayGalleryTitleForGallery(galleryId: string) {
  const srv = supabaseServiceRole()

  const { data: sampleMedia } = await srv
    .from('media_items')
    .select('event_id')
    .eq('gallery_id', galleryId)
    .limit(1)
    .maybeSingle()

  const eventSlug = String((sampleMedia as any)?.event_id || '').trim()

  const { data: gallery } = await srv
    .from('galleries')
    .select('id, title')
    .eq('id', galleryId)
    .maybeSingle()

  let galleryTitle = String((gallery as any)?.title || '').trim() || 'גלריה'

  if (eventSlug) {
    const { data: blocks } = await srv
      .from('blocks')
      .select('config, is_visible, sort_order')
      .eq('event_id', eventSlug)
      .eq('is_visible', true)
      .order('sort_order', { ascending: true })

    const match = (blocks || []).find((b: any) => String(b?.config?.gallery_id || '') === galleryId)
    if (String(match?.config?.title || '').trim()) {
      galleryTitle = String(match.config.title).trim()
    }
  }

  return { galleryTitle, eventSlug }
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const code = cleanCode(params.code)
  if (!code) return {}

  const resolved = await resolveTarget(code)
  if (!resolved) return {}

  const b = baseUrl()
  const pageUrl = `${b}/gl/${encodeURIComponent(code)}`

  if (resolved.mediaItemId) {
    const { galleryTitle, eventSlug } = await getDisplayGalleryTitleForMedia(resolved.mediaItemId)
    const eventName = await getEventName(eventSlug)
    const description = 'לחצו לצפייה בתמונה'
    const ogImage = `${b}/api/og/image?media=${encodeURIComponent(resolved.mediaItemId)}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ''}&v=${encodeURIComponent(code)}`
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

  const { galleryTitle, eventSlug } = await getDisplayGalleryTitleForGallery(galleryId)
  const eventName = await getEventName(eventSlug)
  const description = 'לחצו לצפייה בגלריה והעלאת תמונות'
  const ogImage = `${b}/api/og/image?gallery=${encodeURIComponent(galleryId)}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ''}&v=${encodeURIComponent(code)}`
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
      <p className="text-sm text-zinc-600">מעבירים אותך לתמונה…</p>
      <a className="mt-3 inline-block rounded-full border px-4 py-2 text-sm no-underline" href={href}>
        אם לא עברת אוטומטית — לחץ כאן
      </a>

      <script
        dangerouslySetInnerHTML={{
          __html: `setTimeout(function(){ window.location.href = ${JSON.stringify(href)}; }, 60);`
        }}
      />
    </main>
  )
}
