// Path: src/app/gl/[code]/page.tsx
// Version: V26.1
// Updated: 2026-03-21 18:20
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

function absoluteUrl(path: string) {
  const b = baseUrl()
  if (!b) return path
  return `${b}${path.startsWith('/') ? path : `/${path}`}`
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
    .select('event_id, created_at')
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
    .select('id,title,event_id')
    .eq('id', galleryId)
    .maybeSingle()

  const galleryEventSlug = String((g as any)?.event_id || '').trim()
  let title = String((g as any)?.title || fallbackTitle).trim() || fallbackTitle

  const searchEventIds = Array.from(
    new Set([eventSlug, galleryEventSlug].map(x => String(x || '').trim()).filter(Boolean))
  )

  let blocks: any[] = []

  for (const eid of searchEventIds) {
    const { data } = await srv
      .from('blocks')
      .select('event_id,type,config,is_visible,sort_order,order_index')
      .eq('event_id', eid)
      .eq('is_visible', true)
      .or('type.eq.gallery,type.like.gallery_%')
      .order('sort_order', { ascending: true })
      .order('order_index', { ascending: true })

    if (data?.length) {
      blocks = data as any[]
      break
    }
  }

  if (!blocks.length) {
    const { data } = await srv
      .from('blocks')
      .select('event_id,type,config,is_visible,sort_order,order_index')
      .eq('is_visible', true)
      .or('type.eq.gallery,type.like.gallery_%')
      .order('sort_order', { ascending: true })
      .order('order_index', { ascending: true })

    blocks = (data as any[]) || []
  }

  for (const row of blocks) {
    const cfg = (row as any)?.config || {}
    const cfgGalleryId = String(cfg?.gallery_id || cfg?.galleryId || '').trim()
    const cfgTitle = String(cfg?.title || cfg?.display_title || '').trim()
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
    .select('id, gallery_id, event_id, updated_at, created_at')
    .eq('id', mediaItemId)
    .maybeSingle()

  const eventSlug = String((mi as any)?.event_id || '').trim()
  const settings = await fetchSettings(eventSlug || undefined).catch(() => null)

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

  const versionKey = encodeURIComponent(
    String((mi as any)?.updated_at || (mi as any)?.created_at || mediaItemId)
  )
  const ogImage = absoluteUrl(
    `/api/og/image?media=${encodeURIComponent(String(mediaItemId))}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ''}&v=${versionKey}`
  )

  return { eventName, galleryTitle, description, ogImage, eventSlug }
}

async function getOgForGallery(galleryId: string) {
  const srv = supabaseServiceRole()

  const { data: mi } = await srv
    .from('media_items')
    .select('id, event_id, updated_at, created_at, is_approved')
    .eq('gallery_id', galleryId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const eventSlug = String((mi as any)?.event_id || '').trim() || await getEventSlugForGallery(galleryId)
  const settings = await fetchSettings(eventSlug || undefined).catch(() => null)

  const eventName =
    String((settings as any)?.event_name || '').trim() ||
    eventSlug ||
    'אירוע'

  const galleryTitle = await getGalleryDisplayTitle(galleryId, eventSlug, 'גלריה')

  const description =
    String((settings as any)?.share_gallery_description || '').trim() || 'לחצו לצפייה בתמונה'

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

  const { eventName, galleryTitle, description, ogImage } = await getOgForGallery(galleryId)
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

  const href = resolved.mediaItemId ? `/media/${encodeURIComponent(resolved.mediaItemId)}` : resolved.target

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
