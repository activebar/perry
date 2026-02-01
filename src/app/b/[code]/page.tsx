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

type ResolvedShortLink = {
  code: string
  postId: string | null
  targetPath: string | null
}

function extractUuidFromPath(path: string) {
  const m = path.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return m?.[0]?.toLowerCase() || null
}

async function resolveShortLink(code: string): Promise<ResolvedShortLink | null> {
  const srv = supabaseServiceRole()
  let clean = String(code || '').trim()
  // strip trailing punctuation (e.g. WhatsApp adds '.' at end)
  const m = clean.match(/^[0-9a-zA-Z_-]+/)
  clean = (m?.[0] || '').toLowerCase()
  if (!clean) return null

  // Preferred: lookup from `short_links` (works even when posts.id is UUID)
  const { data: sl } = await srv
    .from('short_links')
    .select('code, post_id, target_path')
    .eq('code', clean)
    .limit(1)

  if (sl && sl.length === 1) {
    const row = sl[0] as any
    const targetPath = (row.target_path as string | null) ?? null
    const postId = (row.post_id as string | null) ?? (targetPath ? extractUuidFromPath(targetPath) : null)
    return { code: clean, postId, targetPath }
  }

  // Backward compatibility: if someone shared a UUID itself, accept it.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
    return { code: clean, postId: clean, targetPath: `/blessings/p/${clean}` }
  }

  return null
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const settings = await fetchSettings()
  const eventName = String((settings as any)?.event_name || 'Event')

  const resolved = await resolveShortLink(params.code)
  const postId = resolved?.postId
  if (!postId) {
    const heroImages = Array.isArray((settings as any)?.hero_images) ? (settings as any).hero_images : []
    const ogDefaultRaw = (settings as any)?.og_default_image_url || (typeof heroImages[0] === 'string' ? heroImages[0] : undefined)
    const ogDefault = toAbsoluteUrl(`/api/og/image?default=1&fallback=${encodeURIComponent(String(ogDefaultRaw || ''))}`)
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

  const resolved = await resolveShortLink(params.code)
  const postId = resolved?.postId
  const to = resolved?.targetPath || (postId ? `/blessings/p/${postId}` : null)

  if (!to) {
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
