import Link from 'next/link'
import type { Metadata } from 'next'
import { supabaseServiceRole } from '@/lib/supabase'
import { fetchSettings } from '@/lib/db'
import { getSiteUrl, toAbsoluteUrl } from '@/lib/site-url'
import { Card, Container, Button } from '@/components/ui'
import RedirectClient from '@/components/RedirectClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function isImage(url?: string | null) {
  return !!url && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)
}

async function resolvePostId(code: string) {
  const srv = supabaseServiceRole()
  // WhatsApp sometimes appends punctuation or query params.
  // Accept either a full UUID or a short prefix (e.g. 8 hex chars).
  const raw = String(code || '').trim()
  const withoutQuery = raw.split('?')[0].split('#')[0]

  // Prefer UUID-ish tokens first
  const uuidish = withoutQuery.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F-]{20,}$/)?.[0]
  if (uuidish) {
    const id = uuidish.toLowerCase()
    const { data: exact } = await srv.from('posts').select('id').eq('id', id).limit(1)
    if (exact && exact.length === 1) return exact[0].id as string
  }

  // Otherwise take the first hex run (prefix)
  const prefix = withoutQuery.match(/^[0-9a-fA-F]{4,32}/)?.[0]?.toLowerCase() || ''
  if (!prefix) return null

  // Use RPC so we can cast uuid -> text (ILIKE on uuid is unreliable / errors).
  try {
    const { data: rpcId } = await srv.rpc('post_id_from_prefix', { p_prefix: prefix })
    if (rpcId) return String(rpcId)
  } catch {
    // ignore
  }

  // Fallback (best-effort): try client-side cast if PostgREST allows.
  const { data } = await srv
    .from('posts')
    .select('id')
    // @ts-ignore - PostgREST doesn't expose explicit casts; RPC above is the real path.
    .ilike('id', `${prefix}%`)
    .order('created_at', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) return null
  return data[0].id as string
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const settings = await fetchSettings()
  const eventName = String((settings as any)?.event_name || 'Event')

  const postId = await resolvePostId(params.code)
  if (!postId) {
    const heroImages = Array.isArray((settings as any)?.hero_images) ? (settings as any).hero_images : []
    const ogDefaultRaw = (settings as any)?.og_default_image_url || (typeof heroImages[0] === 'string' ? heroImages[0] : undefined)
    const ogDefault = toAbsoluteUrl(`/api/og/image?default=1&fallback=${encodeURIComponent(String(ogDefaultRaw || ''))}`)
    return {
      metadataBase: new URL(getSiteUrl()),
      title: eventName,
      description: `${eventName} – ברכות`,
      openGraph: {
        title: eventName,
        description: `${eventName} – ברכות`,
        type: 'website',
        images: ogDefault
          ? [
              { url: ogDefault, width: 1200, height: 630, alt: eventName }
            ]
          : undefined
      },
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

  const ogImage = toAbsoluteUrl(
    `/api/og/image?post=${encodeURIComponent(String(postId))}&fallback=${encodeURIComponent(String(ogDefaultRaw || ''))}`
  )

  const descText = String((post as any)?.text || '').trim()
  const description = descText ? descText.slice(0, 180) : `${eventName} – ברכה`

  return {
    metadataBase: new URL(getSiteUrl()),
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      images: ogImage
        ? [
            { url: ogImage, width: 1200, height: 630, alt: title }
          ]
        : undefined
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

  // Decide redirect target by post kind
  const srv = supabaseServiceRole()
  const { data: post } = await srv.from('posts').select('id, kind, status').eq('id', postId).maybeSingle()

  let to = `/blessings/p/${postId}`
  if ((post as any)?.kind === 'gallery') {
    to = `/gallery#post-${postId}`
  }

  // Client-side redirect keeps OG metadata for crawlers, while sending humans to the full page.
  return (
    <Container className="py-10" dir="rtl">
      <Card className="p-6 text-right">
        <RedirectClient to={to} />
        <div className="text-2xl font-bold">ברכה לאירוע {eventName}</div>
        <div className="mt-3 text-zinc-600">פותח ברכה…</div>
        <div className="mt-6 flex justify-end">
          <Link href={to}>
            <Button>להמשך</Button>
          </Link>
        </div>
      </Card>
    </Container>
  )
}
