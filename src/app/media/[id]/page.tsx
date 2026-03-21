// Path: src/app/media/[id]/page.tsx
// Version: V26.3
// Updated: 2026-03-21 20:05
// Note: resolve event/gallery title strictly from media and gallery data, remove wrong ido-style fallbacks, and use internal download route for reliable downloads

import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Container, Card, Button } from '@/components/ui'
import { supabaseServiceRole } from '@/lib/supabase'
import { fetchSettings } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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

async function getMedia(id: string) {
  const sb = supabaseServiceRole()
  const { data } = await sb
    .from('media_items')
    .select('id, public_url, url, thumb_url, storage_path, gallery_id, kind, is_approved, event_id, mime_type')
    .eq('id', id)
    .maybeSingle()
  return data as any
}

async function resolveGalleryContext(galleryId: string, hintedEventSlug?: string | null) {
  const sb = supabaseServiceRole()

  const { data: gallery } = await sb
    .from('galleries')
    .select('id, title, event_id')
    .eq('id', galleryId)
    .maybeSingle()

  let eventSlug = String(hintedEventSlug || (gallery as any)?.event_id || '').trim()

  if (!eventSlug) {
    const { data: mediaFromGallery } = await sb
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
    const { data: blocks } = await sb
      .from('blocks')
      .select('config, is_visible')
      .eq('event_id', eventSlug)
      .eq('is_visible', true)

    const match = (blocks || []).find((b: any) => {
      const cfgGalleryId = String((b as any)?.config?.gallery_id || '').trim()
      return cfgGalleryId === galleryId
    })

    blockTitle = String((match as any)?.config?.title || '').trim()
  }

  return {
    galleryId,
    galleryTitle: blockTitle || String((gallery as any)?.title || '').trim() || 'תמונה',
    eventSlug,
  }
}

async function resolveMediaContext(id: string) {
  const mi = await getMedia(id)
  if (!mi) return null

  const galleryId = String(mi.gallery_id || '').trim() || null
  let eventSlug = String(mi.event_id || '').trim()
  let galleryTitle = 'תמונה'

  if (galleryId) {
    const galleryCtx = await resolveGalleryContext(galleryId, eventSlug || null)
    if (galleryCtx.eventSlug) eventSlug = galleryCtx.eventSlug
    if (galleryCtx.galleryTitle) galleryTitle = galleryCtx.galleryTitle
  }

  return {
    media: mi,
    galleryId,
    eventSlug,
    galleryTitle,
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const id = decodeURIComponent(params.id)
  if (!/^[0-9a-f-]{36}$/i.test(id)) return {}

  const ctx = await resolveMediaContext(id)
  if (!ctx) return {}

  const settings = ctx.eventSlug ? await fetchSettings(ctx.eventSlug).catch(() => null) : null
  const eventName = String((settings as any)?.event_name || ctx.eventSlug || 'אירוע').trim()
  const title = `${eventName} · ${ctx.galleryTitle}`
  const description = String((settings as any)?.share_gallery_description || '').trim() || 'לחצו לצפייה בתמונה'
  const ogImage = `${baseUrl()}/api/og/image?media=${encodeURIComponent(String(ctx.media.id))}${ctx.eventSlug ? `&event=${encodeURIComponent(ctx.eventSlug)}` : ''}&v=${encodeURIComponent(String(ctx.media.id).slice(0, 8))}`
  const canonical = `${baseUrl()}/media/${encodeURIComponent(id)}`

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

export default async function MediaPage({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id)
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const ctx = await resolveMediaContext(id)
  if (!ctx) notFound()

  const mi = ctx.media
  const url = String(mi.public_url || mi.url || mi.thumb_url || '').trim()
  if (!url) notFound()

  const settings = ctx.eventSlug ? await fetchSettings(ctx.eventSlug).catch(() => null) : null
  const eventName = String((settings as any)?.event_name || ctx.eventSlug || 'אירוע').trim()
  const galleryTitle = String(ctx.galleryTitle || 'תמונה').trim()

  const backToGallery = ctx.galleryId
    ? ctx.eventSlug
      ? `/${encodeURIComponent(ctx.eventSlug)}/gallery/${encodeURIComponent(ctx.galleryId)}`
      : `/gallery/${encodeURIComponent(ctx.galleryId)}`
    : ctx.eventSlug
      ? `/${encodeURIComponent(ctx.eventSlug)}/gallery`
      : `/gallery`

  const downloadHref = `/api/media/${encodeURIComponent(id)}/download`

  return (
    <main className="py-10" dir="rtl">
      <Container>
        <div className="mb-4 text-right">
          <h1 className="text-2xl font-semibold">{eventName}</h1>
          <p className="mt-1 text-sm text-zinc-600">{galleryTitle} · לחצו לפתיחה מלאה או הורדה.</p>
        </div>

        <Card dir="rtl">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl bg-zinc-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={galleryTitle} className="w-full max-h-[75vh] object-contain" />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <a href={url} target="_blank" rel="noreferrer" className="inline-block">
                  <Button>פתיחה מלאה</Button>
                </a>
                <a href={downloadHref} className="inline-block">
                  <Button variant="ghost">הורדה</Button>
                </a>
              </div>
              <Link href={backToGallery}>
                <Button variant="ghost">חזרה לגלריה</Button>
              </Link>
            </div>
          </div>
        </Card>
      </Container>
    </main>
  )
}
