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
  // Prefer service role if configured; otherwise falls back to anon.
  const srv = supabaseServiceRole()

  // WhatsApp sometimes appends punctuation (.) or query params (?v=2).
  // We accept either a full UUID or a short hex prefix (typically first 8 chars).
  const raw = String(code || '').trim()
  let clean = raw.split('?')[0].split('#')[0].trim()

  // keep only leading hex/dash run (strip trailing punctuation)
  const lead = clean.match(/^[0-9a-fA-F-]{4,64}/)?.[0] || ''
  clean = lead.toLowerCase()

  if (!clean) return null

  // 1) Full UUID
  const uuidish = clean.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)?.[0]
  if (uuidish) {
    const { data: exact } = await srv.from('posts').select('id').eq('id', uuidish).limit(1)
    if (exact && exact.length === 1) return exact[0].id as string
  }

  // 2) Prefix (usually 8 hex chars – first UUID segment)
  const prefix = clean.match(/^[0-9a-f]{4,32}/)?.[0] || ''
  if (!prefix) return null

  // Prefer DB RPC if it exists (fast + exact). Support both arg names.
  try {
    const r1 = await srv.rpc('post_id_from_prefix', { p_prefix: prefix } as any)
    if (!r1.error && r1.data) return String(r1.data)
  } catch {}
  try {
    const r2 = await srv.rpc('post_id_from_prefix', { prefix } as any)
    if (!r2.error && r2.data) return String(r2.data)
  } catch {}

  // 3) JS fallback: scan newest N posts and match startsWith(prefix)
  const { data: list } = await srv
    .from('posts')
    .select('id, created_at, status')
    .order('created_at', { ascending: false })
    .limit(2000)

  const hit = (list || []).find((p: any) => {
    const id = String(p.id || '').toLowerCase()
    if (!id.startsWith(prefix)) return false
    // If we only see approved posts under anon/RLS, status may be missing or always 'approved'.
    // Keep a soft check here so we don't accidentally match hidden drafts.
    return !p.status || p.status === 'approved'
  })
  return hit ? String((hit as any).id) : null
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const settings = await fetchSettings()
  const eventName = String((settings as any)?.event_name || 'Event')

  const postId = await resolvePostId(params.code)
  if (!postId) {
    const heroImages = Array.isArray((settings as any)?.hero_images) ? (settings as any).hero_images : []
    const ogDefaultRaw = (settings as any)?.og_default_image_url || (typeof heroImages[0] === 'string' ? heroImages[0] : undefined)
    const ogDefault = toAbsoluteUrl('/og/default.jpg')
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
    `/og/post-jpg/${encodeURIComponent(String(postId))}`
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
