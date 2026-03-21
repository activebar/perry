// src/app/gl/[code]/page.tsx
// Version: V26.0
// Updated: 2026-03-21 17:05
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
    if (mi) {
      return {
        target: String((first.data as any).target_path || ''),
        mediaItemId: mi,
      }
    }

    if ((first.data as any)?.target_path) {
      return {
        target: String((first.data as any).target_path),
        mediaItemId: null,
      }
    }
  }

  const second = await srv
    .from('short_links')
    .select('target_path')
    .eq('code', code)
    .maybeSingle()

  return (second.data as any)?.target_path
    ? { target: String((second.data as any).target_path), mediaItemId: null }
    : null
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

async function getEventSlugForGallery(galleryId: string) {
  const srv = supabaseServiceRole()

  const { data: mi } = await srv
    .from('media_items')
    .select('event_id')
    .in('kind', ['gallery', 'galleries'])
    .eq('gallery_id', galleryId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return String((mi as any)?.event_id || '').trim()
}

async function getGalleryDisplayTitle(galleryId: string, eventSlug: string, fallbackTitle = 'גלריה') {
  const srv = supabaseServiceRole()

  const { data: g } = await srv
    .from('galleries')
    .select('id,title')
    .eq('id', galleryId)
    .maybeSingle()

  let title = String((g as any)?.title || fallbackTitle).trim() || fallbackTitle

  let blocksQuery = srv
    .from('blocks')
    .select('event_id,config,is_visible,sort_order')
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })

  if (eventSlug) {
    blocksQuery = blocksQuery.eq('event_id', eventSlug)
  }

  const { data: blocks } = await blocksQuery

  for (const row of (blocks as any[]) || []) {
    const cfg = (row as any)?.config || {}
    const cfgGalleryId = String(cfg?.gallery_id || '').trim()
    const cfgTitle = String(cfg?.title || '').trim()
    if (cfgGalleryId && cfgGalleryId === galleryId && cfgTitle) {
      title = cfgTitle
      break
    }
  }

  return title
}

async function getOgForMedia(mediaItemId: string) {
  const srv = supabaseServiceRole()

  const { data: mi } = await srv
    .from('media_items')
    .select('id, gallery_id, event_id')
    .eq('id', mediaItemId)
    .maybeSingle()

  const eventSlug = String((mi as any)?.event_id || '').trim()
  const settings = await fetchSettings(eventSlug || undefined)

  let galleryTitle = 'תמונה'
  if ((mi as any)?.gallery_id) {
    galleryTitle = await getGalleryDisplayTitle(String((mi as any).gallery_id), eventSlug, 'תמונה')
  }

  const eventName =
    String((settings as any)?.event_name || '').trim() ||
    eventSlug ||
    'אירוע'

  const description =
    String((settings as any)?.share_gallery_description || '').trim() || 'לחצו לצפייה בתמונה'

  const b = baseUrl()
  const ogImage = `${b}/api/og/image?media=${encodeURIComponent(String(mediaItemId))}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ''}`

  return { eventName, galleryTitle, description, ogImage }
}

async function getOgForGallery(galleryId: string) {
  const srv = supabaseServiceRole()

  const { data: mi } = await srv
    .from('media_items')
    .select('id, event_id')
    .in('kind', ['gallery', 'galleries'])
    .eq('gallery_id', galleryId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const eventSlug = String((mi as any)?.event_id || '').trim() || await getEventSlugForGallery(galleryId)
  const settings = await fetchSettings(eventSlug || undefined)

  const eventName =
    String((settings as any)?.event_name || '').trim() ||
    eventSlug ||
    'אירוע'

  const galleryTitle = await getGalleryDisplayTitle(galleryId, eventSlug, 'גלריה')

  const description =
    String((settings as any)?.share_gallery_description || '').trim() || 'לחצו לצפייה בתמונה'

  const b = baseUrl()
  const ogImage = mi?.id
    ? `${b}/api/og/image?media=${encodeURIComponent(String(mi.id))}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ''}`
    : `${b}/api/og/image?default=1${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ''}`

  return { eventName, galleryTitle, description, ogImage }
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const code = cleanCode(params.code)
  if (!code) return {}

  const resolved = await resolveTarget(code)
  if (!resolved) return {}

  if (resolved.mediaItemId) {
    const { eventName, galleryTitle, description, ogImage } = await getOgForMedia(resolved.mediaItemId)
    const title = `${eventName} · ${galleryTitle}`

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
        images: [{ url: ogImage, width: 630, height: 630 }],
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

  const { eventName, galleryTitle, description, ogImage } = await getOgForGallery(galleryId)
  const title = `${eventName} · ${galleryTitle}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: [{ url: ogImage, width: 630, height: 630 }],
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

  const href = resolved.mediaItemId ? `/media/${encodeURIComponent(resolved.mediaItemId)}` : resolved.target

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
