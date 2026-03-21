// Path: src/app/media/[id]/page.tsx
// Version: V26.4
// Updated: 2026-03-21 16:45
// Note: remove default event fallback, infer event from gallery when missing, stabilize OG and back-to-gallery routing

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

function absoluteUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path
  const b = baseUrl()
  if (!b) return path
  return `${b}${path.startsWith('/') ? path : `/${path}`}`
}

async function getMedia(id: string) {
  const sb = supabaseServiceRole()
  const { data } = await sb
    .from('media_items')
    .select('id, public_url, url, thumb_url, storage_path, gallery_id, kind, is_approved, event_id, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()
  return data as any
}

async function inferEventSlug(mi: any): Promise<string> {
  const direct = String(mi?.event_id || '').trim()
  if (direct) return direct

  const galleryId = String(mi?.gallery_id || '').trim()
  if (!galleryId) return ''

  const sb = supabaseServiceRole()

  const { data: gallery } = await sb
    .from('galleries')
    .select('event_id')
    .eq('id', galleryId)
    .maybeSingle()

  const fromGallery = String((gallery as any)?.event_id || '').trim()
  if (fromGallery) return fromGallery

  const { data: siblingApproved } = await sb
    .from('media_items')
    .select('event_id, created_at')
    .eq('gallery_id', galleryId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const fromSiblingApproved = String((siblingApproved as any)?.event_id || '').trim()
  if (fromSiblingApproved) return fromSiblingApproved

  const { data: siblingAny } = await sb
    .from('media_items')
    .select('event_id, created_at')
    .eq('gallery_id', galleryId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return String((siblingAny as any)?.event_id || '').trim()
}

async function inferGalleryTitle(galleryId: string | null, eventSlug: string): Promise<string> {
  if (!galleryId) return 'תמונה'

  const sb = supabaseServiceRole()

  const { data: g } = await sb
    .from('galleries')
    .select('id, title, event_id')
    .eq('id', galleryId)
    .maybeSingle()

  const fallback = String((g as any)?.title || '').trim() || 'תמונה'

  if (!eventSlug) return fallback

  const { data: blocks } = await sb
    .from('blocks')
    .select('config, type, is_visible, sort_order, order_index')
    .eq('event_id', eventSlug)
    .eq('is_visible', true)
    .or('type.eq.gallery,type.like.gallery_%')
    .order('sort_order', { ascending: true })
    .order('order_index', { ascending: true })

  for (const row of (blocks as any[]) || []) {
    const cfg = (row as any)?.config || {}
    const cfgGalleryId = String(cfg?.gallery_id || cfg?.galleryId || '').trim()
    const cfgTitle = String(cfg?.title || cfg?.display_title || '').trim()
    if (cfgGalleryId && cfgGalleryId === galleryId && cfgTitle) {
      return cfgTitle
    }
  }

  return fallback
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const id = decodeURIComponent(params.id)
  if (!/^[0-9a-f-]{36}$/i.test(id)) return {}

  const mi = await getMedia(id)
  if (!mi) return {}

  const eventSlug = await inferEventSlug(mi)
  const settings = eventSlug ? await fetchSettings(eventSlug).catch(() => null) : null
  const galleryId = mi?.gallery_id ? String(mi.gallery_id) : null
  const galleryTitle = await inferGalleryTitle(galleryId, eventSlug)

  const eventName =
    String((settings as any)?.event_name || '').trim() ||
    eventSlug ||
    'אירוע'

  const title = `${eventName} · ${galleryTitle}`
  const description =
    String((settings as any)?.share_gallery_description || '').trim() ||
    'לחצו לצפייה בתמונה'

  const versionKey = encodeURIComponent(
    String(mi?.updated_at || mi?.created_at || id)
  )

  const pageUrl = absoluteUrl(`/media/${encodeURIComponent(id)}`)
  const ogImage = absoluteUrl(
    `/api/og/image?media=${encodeURIComponent(String(mi.id))}${eventSlug ? `&event=${encodeURIComponent(eventSlug)}` : ''}&v=${versionKey}`
  )

  const b = baseUrl()

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
  const eventSlug = await inferEventSlug(mi)
  const galleryTitle = await inferGalleryTitle(galleryId, eventSlug)

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
          <h1 className="text-2xl font-semibold">{galleryTitle}</h1>
          <p className="mt-1 text-sm text-zinc-600">לחצו לפתיחה מלאה או הורדה.</p>
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
