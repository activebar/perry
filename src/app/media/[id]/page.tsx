import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { Container, Card, Button } from '@/components/ui'
import { supabaseServiceRole } from '@/lib/supabase'

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

function toPublic(storagePath: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  return supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/uploads/${storagePath}` : ''
}

function galleryTitleFromConfig(cfg: any, fallback = '') {
  return (
    String(cfg?.title || '').trim() ||
    String(cfg?.button_label || '').trim() ||
    String(cfg?.label || '').trim() ||
    String(cfg?.name || '').trim() ||
    fallback
  )
}

async function getGalleryDisplayTitle(eventId: string, galleryId: string, fallback = 'תמונה') {
  if (!eventId || !galleryId) return fallback
  const sb = supabaseServiceRole()
  const { data: blocks } = await sb
    .from('blocks')
    .select('config,order_index,is_visible,type')
    .eq('event_id', eventId)
    .eq('is_visible', true)
    .or('type.eq.gallery,type.like.gallery_%')
    .order('order_index', { ascending: true })
  for (const b of blocks || []) {
    const cfg = (b as any)?.config || {}
    if (String(cfg?.gallery_id || '').trim() === galleryId) return galleryTitleFromConfig(cfg, fallback)
  }
  return fallback
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

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const id = decodeURIComponent(params.id)
  if (!/^[0-9a-f-]{36}$/i.test(id)) return {}

  const mi = await getMedia(id)
  if (!mi) return {}

  let eventName = 'אירוע'
  let description = 'לחצו לצפייה בתמונה'
  let galleryTitle = 'תמונה'
  if (mi.gallery_id && mi.event_id) {
    galleryTitle = await getGalleryDisplayTitle(String(mi.event_id), String(mi.gallery_id), 'תמונה')
  }

  if (mi.event_id) {
    const sb = supabaseServiceRole()
    const { data: settings } = await sb
      .from('event_settings')
      .select('event_name,share_gallery_description')
      .eq('event_id', String(mi.event_id))
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if ((settings as any)?.event_name) eventName = String((settings as any).event_name)
    if ((settings as any)?.share_gallery_description) description = String((settings as any).share_gallery_description)
  }

  const title = `${eventName} · ${galleryTitle}`
  const ogImage = `${baseUrl()}/api/og/image?media=${encodeURIComponent(String(mi.id))}`

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

export default async function MediaPage({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id)
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const mi = await getMedia(id)
  if (!mi) notFound()

  const url = String(mi.public_url || mi.url || mi.thumb_url || '').trim()
  if (!url) notFound()

  const galleryId = mi.gallery_id ? String(mi.gallery_id) : null
  const eventId = mi.event_id ? String(mi.event_id) : null

  return (
    <main className="py-10" dir="rtl">
      <Container>
        <div className="mb-4 text-right">
          <h1 className="text-2xl font-semibold">{galleryId && eventId ? 'תמונה מהגלריה' : 'תמונה'}</h1>
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
                <a href={url} download className="inline-block">
                  <Button variant="ghost">הורדה</Button>
                </a>
              </div>
              {galleryId && eventId ? (
                <Link href={`/${encodeURIComponent(eventId)}/gallery/${encodeURIComponent(galleryId)}`}>
                  <Button variant="ghost">חזרה לגלריה</Button>
                </Link>
              ) : eventId ? (
                <Link href={`/${encodeURIComponent(eventId)}/gallery`}>
                  <Button variant="ghost">לכל הגלריות</Button>
                </Link>
              ) : (
                <Link href="/">
                  <Button variant="ghost">לכל הגלריות</Button>
                </Link>
              )}
            </div>
          </div>
        </Card>
      </Container>
    </main>
  )
}
