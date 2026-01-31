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

async function resolvePostId(code: string) {
  const srv = supabaseServiceRole()
  const { data } = await srv
    .from('posts')
    .select('id')
    .ilike('id', `${code}-%`)
    .limit(2)

  if (!data || data.length !== 1) return null
  return data[0].id as string
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const settings = await fetchSettings()
  const eventName = String((settings as any)?.event_name || 'Event')

  const postId = await resolvePostId(params.code)
  if (!postId) {
    const heroImages = Array.isArray((settings as any)?.hero_images) ? (settings as any).hero_images : []
    const ogDefaultRaw = (settings as any)?.og_default_image_url || (typeof heroImages[0] === 'string' ? heroImages[0] : undefined)
    const ogDefault = toAbsoluteUrl(ogDefaultRaw)
    return {
      metadataBase: new URL(getSiteUrl()),
      title: eventName,
      description: `${eventName} – ברכות`,
      openGraph: { title: eventName, description: `${eventName} – ברכות`, images: ogDefault ? [{ url: ogDefault }] : undefined },
      twitter: { card: ogDefault ? 'summary_large_image' : 'summary', title: eventName, description: `${eventName} – ברכות`, images: ogDefault ? [ogDefault] : undefined }
    }
  }

  const srv = supabaseServiceRole()
  const { data: post } = await srv
    .from('posts')
    .select('id, author_name, text, media_url, status, kind')
    .eq('id', postId)
    .maybeSingle()

  const titleBase = `🎉 ${eventName} 🎉`
  const author = (post as any)?.author_name ? ` – ${(post as any).author_name}` : ''
  const title = `${titleBase}${author}`

  const heroImages = Array.isArray((settings as any)?.hero_images) ? (settings as any).hero_images : []
  const ogDefaultRaw = (settings as any)?.og_default_image_url || (typeof heroImages[0] === 'string' ? heroImages[0] : undefined)

  const mediaUrl = (post as any)?.media_url as string | undefined
  const ogImage = toAbsoluteUrl(isImage(mediaUrl) ? mediaUrl : ogDefaultRaw)

  const descText = String((post as any)?.text || '').trim()
  const description = descText ? descText.slice(0, 180) : `${eventName} – ברכה`

  return {
    metadataBase: new URL(getSiteUrl()),
    title,
    description,
    openGraph: {
      title,
      description,
      images: ogImage ? [{ url: ogImage }] : undefined
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      images: ogImage ? [ogImage] : undefined
    }
  }
}

export default async function ShortBlessingPage({ params }: { params: { code: string } }) {
  const settings = await fetchSettings()
  const eventName = String((settings as any)?.event_name || 'Event')

  const postId = await resolvePostId(params.code)
  if (!postId) {
    return (
      <Container className="py-10" dir="rtl">
        <Card className="p-6 text-right">
          <div className="text-2xl font-bold">ברכה לאירוע {eventName}</div>
          <div className="mt-3 text-zinc-600">הברכה לא נמצאה.</div>
          <div className="mt-6 flex justify-end">
            <Link href="/blessings">
              <Button>לעמוד הברכות</Button>
            </Link>
          </div>
        </Card>
      </Container>
    )
  }

  // redirect to the canonical permalink page (keeps OG because /b has metadata too)
  return (
    <Container className="py-10" dir="rtl">
      <Card className="p-6 text-right">
        <div className="text-2xl font-bold">ברכה לאירוע {eventName}</div>
        <div className="mt-3 text-zinc-600">פותח ברכה…</div>
        <div className="mt-6 flex justify-end">
          <Link href={`/blessings/p/${postId}`}>
            <Button>להמשך</Button>
          </Link>
        </div>
      </Card>
    </Container>
  )
}
