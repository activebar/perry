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

function extractMediaIdFromTarget(targetPath: string | null) {
  if (!targetPath) return null
  const m = String(targetPath).match(/\/media\/([0-9a-f-]{36})/i)
  return m?.[1] || null
}

function normalizeGalleryTarget(targetPath: string | null, eventId?: string | null) {
  const raw = String(targetPath || '').trim()
  const event = String(eventId || '').trim()
  if (!raw) return ''
  if (event && /^\/gallery(?:[#/?].*)?$/i.test(raw)) return `/${encodeURIComponent(event)}${raw}`
  return raw
}

async function resolveTarget(code: string) {
  const srv = supabaseServiceRole()

  const first = await srv
    .from('short_links')
    .select('target_path, kind, media_item_id, event_id')
    .eq('code', code)
    .maybeSingle()

  if (first.data) {
    const eventId = String((first.data as any).event_id || '').trim() || null
    const explicitMediaId = (first.data as any).media_item_id ? String((first.data as any).media_item_id) : null
    const targetPath = String((first.data as any).target_path || '')
    const targetMediaId = extractMediaIdFromTarget(targetPath)
    const mediaItemId = explicitMediaId || targetMediaId
    const target = normalizeGalleryTarget(targetPath, eventId)

    if (mediaItemId) {
      return { target: target || `/media/${encodeURIComponent(mediaItemId)}`, mediaItemId, eventId }
    }

    if (target) return { target, mediaItemId: null, eventId }
  }

  const second = await srv
    .from('short_links')
    .select('target_path, media_item_id, event_id')
    .eq('code', code)
    .maybeSingle()

  if (second.data) {
    const eventId = String((second.data as any).event_id || '').trim() || null
    const explicitMediaId = (second.data as any).media_item_id ? String((second.data as any).media_item_id) : null
    const targetPath = String((second.data as any).target_path || '')
    const targetMediaId = extractMediaIdFromTarget(targetPath)
    const mediaItemId = explicitMediaId || targetMediaId
    const target = normalizeGalleryTarget(targetPath, eventId)

    if (mediaItemId) {
      return { target: target || `/media/${encodeURIComponent(mediaItemId)}`, mediaItemId, eventId }
    }

    if (target) return { target, mediaItemId: null, eventId }
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

  // IMPORTANT: WhatsApp/Facebook scrapers rely on absolute URLs.
  // If env vars are missing in runtime, fall back to request headers.
  return baseUrlFromHeaders()
}

function extractGalleryIdFromTarget(targetPath: string | null) {
  if (!targetPath) return null
  const m = String(targetPath).match(/\/gallery\/([0-9a-f-]{36})/i)
  return m?.[1] || null
}

async function getOgForMedia(mediaItemId: string, eventHint?: string | null) {
  const srv = supabaseServiceRole()

  const { data: mi } = await srv
    .from('media_items')
    .select('id, gallery_id, public_url, storage_path, url, thumb_url, event_id')
    .eq('id', mediaItemId)
    .maybeSingle()

  const resolvedEventId = String((mi as any)?.event_id || eventHint || '').trim() || undefined
  const settings = await fetchSettings(resolvedEventId).catch(() => null)

  // Prefer a direct public URL for WhatsApp reliability.
  // (WhatsApp sometimes fails to fetch dynamic OG image routes.)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const bucket = 'uploads'
  const toPublic = (storagePath: string) => (supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}` : '')
  const directUrl =
    (mi as any)?.thumb_url || (mi as any)?.public_url || (mi as any)?.url || ((mi as any)?.storage_path ? toPublic(String((mi as any).storage_path)) : '')

  let galleryTitle = 'תמונה'
  if ((mi as any)?.gallery_id) {
    const { data: g } = await srv
      .from('galleries')
      .select('id,title')
      .eq('id', String((mi as any).gallery_id))
      .maybeSingle()

    if ((g as any)?.title) galleryTitle = String((g as any).title)
  }

  const eventName = String((settings as any)?.event_name || resolvedEventId || 'אירוע')
  const description = String((settings as any)?.share_gallery_description || '').trim() || 'לחצו לצפייה בתמונה'

  const b = baseUrl()
  // Use direct URL if available, otherwise fall back to the dynamic OG generator
  const ogImage = directUrl ? String(directUrl) : `${b}/api/og/image?media=${encodeURIComponent(String(mediaItemId))}`

  return { eventName, galleryTitle, description, ogImage }
}

async function getOgForGallery(galleryId: string, eventHint?: string | null) {
  const srv = supabaseServiceRole()

  const { data: g } = await srv
    .from('galleries')
    .select('id,title,event_id')
    .eq('id', galleryId)
    .maybeSingle()

  const resolvedEventId = String((g as any)?.event_id || eventHint || '').trim() || undefined
  const settings = await fetchSettings(resolvedEventId).catch(() => null)

  const { data: mi } = await srv
    .from('media_items')
    .select('id, public_url, storage_path, url, thumb_url')
    .in('kind', ['gallery', 'galleries'])
    .eq('gallery_id', galleryId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const eventName = String((settings as any)?.event_name || resolvedEventId || 'אירוע')
  const galleryTitle = String((g as any)?.title || 'גלריה')
  const description = String((settings as any)?.share_gallery_description || '').trim() || 'לחצו לצפייה בגלריה והעלאת תמונות'

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const bucket = 'uploads'
  const toPublic = (storagePath: string) => (supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}` : '')
  const directUrl =
    (mi as any)?.thumb_url || (mi as any)?.public_url || (mi as any)?.url || ((mi as any)?.storage_path ? toPublic(String((mi as any).storage_path)) : '')

  const b = baseUrl()
  const ogImage = directUrl
    ? String(directUrl)
    : mi?.id
      ? `${b}/api/og/image?media=${encodeURIComponent(String(mi.id))}`
      : `${b}/api/og/image?default=1`

  return { eventName, galleryTitle, description, ogImage }
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const code = cleanCode(params.code)
  if (!code) return {}

  const resolved = await resolveTarget(code)
  if (!resolved) return {}

  // Media link: OG should be based on the specific media item
  if (resolved.mediaItemId) {
    const { eventName, galleryTitle, description, ogImage } = await getOgForMedia(resolved.mediaItemId, resolved.eventId)
    const title = `${eventName} · ${galleryTitle}`

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
        images: [{ url: ogImage, width: 630, height: 630 }]
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [ogImage]
      }
    }
  }

  const galleryId = extractGalleryIdFromTarget(resolved.target)
  if (!galleryId) return {}

  const { eventName, galleryTitle, description, ogImage } = await getOgForGallery(galleryId, resolved.eventId)
  const title = `${eventName} · ${galleryTitle}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: [{ url: ogImage, width: 630, height: 630 }]
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage]
    }
  }
}

export default async function ShortGLLinkPage({ params }: { params: { code: string } }) {
  const code = cleanCode(params.code)
  if (!code) notFound()

  const resolved = await resolveTarget(code)
  if (!resolved) notFound()

  // IMPORTANT: keep as client-side redirect so OG meta is visible to scrapers.
  const href = resolved.mediaItemId ? `/media/${encodeURIComponent(resolved.mediaItemId)}` : resolved.target

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
