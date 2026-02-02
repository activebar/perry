import Link from 'next/link'
import type { Metadata } from 'next'
import { supabaseServiceRole } from '@/lib/supabase'
import { fetchSettings } from '@/lib/db'
import { getSiteUrl, toAbsoluteUrl } from '@/lib/site-url'
import { Container, Card, Button } from '@/components/ui'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function isImage(url?: string | null) {
  return !!url && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const settings = await fetchSettings().catch(() => ({} as any))
  const eventName = String((settings as any)?.event_name || 'Event')

  const srv = supabaseServiceRole()
  const { data: post } = await srv
    .from('posts')
    .select('id, author_name, text, media_url, video_url, status, kind, created_at')
    .eq('id', params.id)
    .maybeSingle()

  const author = String((post as any)?.author_name || '').trim()
  const title = author ? `${eventName} – גלריה – ${author}` : `${eventName} – גלריה`
  const text = String((post as any)?.text || '').trim()
  const desc = text ? text.replace(/\s+/g, ' ').slice(0, 180) : String((settings as any)?.meta_description || '').trim()

  const site = getSiteUrl()
  const heroImages = Array.isArray((settings as any)?.hero_images) ? (settings as any).hero_images : []
  const fallback = (settings as any)?.og_default_image_url || (typeof heroImages[0] === 'string' ? heroImages[0] : null) || ''
  const fbAbs = fallback ? toAbsoluteUrl(fallback) : undefined
  const og = `${site}/api/og/image?post=${encodeURIComponent(params.id)}${fbAbs ? `&fallback=${encodeURIComponent(fbAbs)}` : ''}`

  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      type: 'website',
      images: [{ url: og }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: desc,
      images: [og],
    },
  }
}

export default async function GalleryItemPage({ params }: { params: { id: string } }) {
  const settings = await fetchSettings().catch(() => ({} as any))
  const eventName = String((settings as any)?.event_name || 'Event')

  const srv = supabaseServiceRole()
  const { data: post } = await srv
    .from('posts')
    .select('id, author_name, text, media_url, video_url, status, kind, created_at')
    .eq('id', params.id)
    .maybeSingle()

  const url = String((post as any)?.media_url || (post as any)?.video_url || '').trim()
  const isVid = !!(post as any)?.video_url && !(post as any)?.media_url

  return (
    <Container>
      <div dir="rtl" className="mx-auto w-full max-w-3xl px-4 py-10">
        <Card className="p-6 text-right">
          <div className="text-2xl font-bold">גלריה לאירוע {eventName}</div>
          {String((post as any)?.author_name || '').trim() && (
            <div className="mt-3 text-sm text-zinc-600">מאת: {String((post as any)?.author_name || '').trim()}</div>
          )}
          {String((post as any)?.text || '').trim() && (
            <div className="mt-4 whitespace-pre-wrap text-base">{String((post as any)?.text || '').trim()}</div>
          )}

          {!!url && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200">
              {isVid ? (
                <video src={url} controls className="w-full h-auto" />
              ) : isImage(url) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="w-full h-auto object-cover" />
              ) : (
                <div className="p-4 text-sm text-zinc-600">קובץ מצורף</div>
              )}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <Link href="/gallery">
              <Button>חזרה לגלריה</Button>
            </Link>
          </div>
        </Card>
      </div>
    </Container>
  )
}
