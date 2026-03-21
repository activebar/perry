// Path: src/app/media/[id]/page.tsx
// Version: V26.5
// Updated: 2026-03-21 20:20
// Note: fix TypeScript-safe gallery title resolution + correct event settings lookup + stable media page metadata

import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
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
    .select('id, public_url, url, thumb_url, storage_path, gallery_id, kind, is_approved, event_id')
    .eq('id', id)
    .maybeSingle()
  return data as any
}

async function resolveEventSlugForMedia(mi: any) {
  const sb = supabaseServiceRole()

  let eventSlug = String(mi?.event_id || '').trim()
  const galleryId = String(mi?.gallery_id || '').trim()

  if (!eventSlug && galleryId) {
    const { data: galleryRow } = await sb
      .from('galleries')
      .select('event_id')
      .eq('id', galleryId)
      .maybeSingle()

    eventSlug = String((galleryRow as any)?.event_id || '').trim()
  }

  if (!eventSlug && galleryId) {
    const { data: sibling } = await sb
      .from('media_items')
      .select('event_id')
      .eq('gallery_id', galleryId)
      .not('event_id', 'is', null)
      .limit(1)
      .maybeSingle()

    eventSlug = String((sibling as any)?.event_id || '').trim()
  }

  return eventSlug
}

async function getDisplayGalleryTitle(galleryId: string, eventSlug: string) {
  const sb = supabaseServiceRole()

  const { data: blocks } = await sb
    .from('blocks')
    .select('config')
    .eq('event_id', eventSlug)
    .eq('is_visible', true)

  const match = (blocks || []).find(
    (b: any) => String(b?.config?.gallery_id || '').trim() === galleryId
  )
  const matchedTitle = String(match?.config?.title || '').trim()
  if (matchedTitle) return matchedTitle

  const { data: gallery } = await sb
    .from('galleries')
    .select('title')
    .eq('id', galleryId)
    .maybeSingle()

  return String((gallery as any)?.title || '').trim() || 'תמונה'
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const id = decodeURIComponent(params.id)
  if (!/^[0-9a-f-]{36}$/i.test(id)) return {}

  const mi = await getMedia(id)
  if (!mi) return {}

  const eventSlug = await resolveEventSlugForMedia(mi)
  const galleryId = String(mi.gallery_id || '').trim()

  let eventName = 'אירוע'
  let description = 'לחצו לצפייה בתמונה'
  let galleryTitle = 'תמונה'

  if (eventSlug) {
    const settings = await fetchSettings(eventSlug).catch(() => null)
    eventName = String((settings as any)?.event_name || '').trim() || eventSlug || eventName
    description = String((settings as any)?.share_gallery_description || '').trim() || description
  }

  if (galleryId && eventSlug) {
    galleryTitle = await getDisplayGalleryTitle(galleryId, eventSlug)
  }

  const title = `${eventName} · ${galleryTitle}`
  const b = baseUrl()
  const ogImage = `${b}/api/og/image?media=${encodeURIComponent(String(mi.id))}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ''}&v=${Date.now()}`
  const pageUrl = `${b}/media/${encodeURIComponent(id)}`

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

export default async function MediaPage({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id)
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const mi = await getMedia(id)
  if (!mi) notFound()

  const url = String(mi.public_url || mi.url || mi.thumb_url || '').trim()
  if (!url) notFound()

  const galleryId = mi.gallery_id ? String(mi.gallery_id) : null
  const eventSlug = await resolveEventSlugForMedia(mi)

  let pageTitle = 'תמונה'
  if (galleryId && eventSlug) {
    pageTitle = await getDisplayGalleryTitle(galleryId, eventSlug)
  }

  const backToGallery = galleryId
    ? eventSlug
      ? `/${encodeURIComponent(eventSlug)}/gallery/${encodeURIComponent(galleryId)}`
      : `/gallery/${encodeURIComponent(galleryId)}`
    : eventSlug
      ? `/${encodeURIComponent(eventSlug)}/gallery`
      : `/gallery`

  return (
    <main className="py-10" dir="rtl">
      <Container>
        <div className="mb-4 text-right">
          <h1 className="text-2xl font-semibold">{pageTitle}</h1>
          <p className="mt-1 text-sm text-zinc-600">לחצו לפתיחה מלאה או הורדה.</p>
        </div>

        <Card dir="rtl">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl bg-zinc-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={pageTitle} className="w-full max-h-[75vh] object-contain" />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <a href={url} target="_blank" rel="noreferrer" className="inline-block">
                  <Button>פתיחה מלאה</Button>
                </a>
                <a href={url} download className="inline-block">
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
