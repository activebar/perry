// Path: src/app/media/[id]/page.tsx
// Version: V26.4
// Updated: 2026-03-21 19:35
// Note: absolute metadata URLs for X/WhatsApp + stable event-bound title/description + working download route

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

async function getDisplayTitle(eventSlug: string, galleryId: string | null) {
  if (!eventSlug || !galleryId) return 'תמונה'

  const sb = supabaseServiceRole()
  const { data: blocks } = await sb
    .from('blocks')
    .select('config, is_visible, sort_order')
    .eq('event_id', eventSlug)
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })

  const match = (blocks || []).find((b: any) => String(b?.config?.gallery_id || '') === galleryId)
  if (String(match?.config?.title || '').trim()) return String(match.config.title).trim()

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

  const eventSlug = String(mi.event_id || '').trim()
  if (!eventSlug) return {}

  const galleryId = mi.gallery_id ? String(mi.gallery_id).trim() : null
  const settings = await fetchSettings(eventSlug).catch(() => null)
  const eventName = String((settings as any)?.event_name || '').trim() || eventSlug
  const displayTitle = await getDisplayTitle(eventSlug, galleryId)
  const title = `${eventName} · ${displayTitle}`
  const description = String((settings as any)?.share_gallery_description || '').trim() || 'לחצו לצפייה בתמונה'

  const b = baseUrl()
  const pageUrl = `${b}/media/${encodeURIComponent(String(mi.id))}`
  const ogImage = `${b}/api/og/image?media=${encodeURIComponent(String(mi.id))}&event=${encodeURIComponent(eventSlug)}&v=${encodeURIComponent(String(mi.id))}`

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
  const eventSlug = String(mi.event_id || '').trim()
  const backToGallery = galleryId
    ? eventSlug
      ? `/${encodeURIComponent(eventSlug)}/gallery/${encodeURIComponent(galleryId)}`
      : `/gallery/${encodeURIComponent(galleryId)}`
    : eventSlug
      ? `/${encodeURIComponent(eventSlug)}/gallery`
      : `/gallery`

  const downloadHref = `/api/media/${encodeURIComponent(String(mi.id))}/download`

  return (
    <main className="py-10" dir="rtl">
      <Container>
        <div className="mb-4 text-right">
          <h1 className="text-2xl font-semibold">תמונה</h1>
          <p className="mt-1 text-sm text-zinc-600">לחצו לפתיחה מלאה או הורדה.</p>
        </div>

        <Card dir="rtl">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl bg-zinc-100">
              <img src={url} alt="" className="w-full max-h-[75vh] object-contain" />
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
