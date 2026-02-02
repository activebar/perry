import Link from 'next/link'
import type { Metadata } from 'next'
import { supabaseServiceRole } from '@/lib/supabase'
import { fetchSettings } from '@/lib/db'
import { getSiteUrl, toAbsoluteUrl } from '@/lib/site-url'
import { Card, Container, Button } from '@/components/ui'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function isImage(url?: string | null) {
  return !!url && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const settings = await fetchSettings()
  const eventName = String((settings as any)?.event_name || 'Event')

  const srv = supabaseServiceRole()
  const { data: post } = await srv
    .from('posts')
    .select('id, author_name, text, media_url, video_url, status, kind, created_at')
    .eq('id', params.id)
    .maybeSingle()

  const titleBase = `🎉 ${eventName} 🎉`
  const author = (post as any)?.author_name ? ` – ${(post as any).author_name}` : ''
  const title = `${titleBase}${author}`

  const heroImages = Array.isArray((settings as any)?.hero_images) ? (settings as any).hero_images : []
  const ogDefault = (settings as any)?.og_default_image_url || (typeof heroImages[0] === 'string' ? heroImages[0] : undefined)

  // Use our proxy endpoint so crawlers can always fetch the image.
  const ogImage = toAbsoluteUrl(`/api/og/image?post=${encodeURIComponent(params.id)}${ogDefault ? `&fallback=${encodeURIComponent(String(ogDefault))}` : ''}&v=1`)

  const descText = String((post as any)?.text || '').trim()
  const description = descText ? descText.slice(0, 180) : `${eventName} – ברכה`

  return {
    metadataBase: new URL(getSiteUrl()),
    title,
    description,
    openGraph: {
      title,
      description,
      images: ogImage ? [{ url: ogImage, width: 800, height: 800, alt: title, type: 'image/jpeg' }] : undefined
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      images: ogImage ? [{ url: ogImage, width: 800, height: 800, alt: title }] : undefined
    }
  }
}

export default async function BlessingPermalinkPage({ params }: { params: { id: string } }) {
  const settings = await fetchSettings()
  const eventName = String((settings as any)?.event_name || 'Event')

  const srv = supabaseServiceRole()
  const { data: post } = await srv
    .from('posts')
    .select('id, author_name, text, media_url, video_url, link_url, status, kind, created_at')
    .eq('id', params.id)
    .maybeSingle()

  const ok = post && (post as any).kind === 'blessing' && (post as any).status === 'approved'
  const anchorLink = `/blessings#post-${params.id}`

  return (
    <Container className="py-10" dir="rtl">
      <Card className="p-6 text-right">
        <div className="text-2xl font-bold">ברכה לאירוע {eventName}</div>
        {!ok ? (
          <div className="mt-3 text-zinc-600">הברכה לא נמצאה או לא אושרה.</div>
        ) : (
          <>
            {(post as any).author_name ? (
              <div className="mt-3 text-sm text-zinc-600">מאת: {(post as any).author_name}</div>
            ) : null}

            {(post as any).text ? (
              <div className="mt-4 whitespace-pre-wrap text-base">{(post as any).text}</div>
            ) : null}

            {isImage((post as any).media_url) ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={(post as any).media_url} alt="" className="w-full h-auto object-cover" />
              </div>
            ) : null}

            <div className="mt-6 flex justify-end">
              <Link href={anchorLink}>
                <Button>לצפייה בתוך עמוד הברכות</Button>
              </Link>
            </div>
          </>
        )}
      </Card>
    </Container>
  )
}
