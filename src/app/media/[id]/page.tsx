import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Container, Card, Button } from '@/components/ui'
import { supabaseServiceRole } from '@/lib/supabase'
import { fetchSettings } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function baseUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/$/, '')
  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`.replace(/\/$/, '')
  return ''
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

  const settings = await fetchSettings().catch(() => null)
  const mi = await getMedia(id)
  if (!mi) return {}

  const eventName = String((settings as any)?.event_name || 'אירוע')
  const title = `${eventName} · תמונה` 
  const description = String((settings as any)?.share_gallery_description || 'לחצו לצפייה בתמונה')
  const b = baseUrl()
  const ogImage = `${b}/api/og/image?media=${encodeURIComponent(String(mi.id))}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: [{ url: ogImage, width: 800, height: 800 }],
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
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
              {galleryId ? (
                <Link href={`/gallery/${encodeURIComponent(galleryId)}`}>
                  <Button variant="ghost">חזרה לגלריה</Button>
                </Link>
              ) : (
                <Link href="/gallery">
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
