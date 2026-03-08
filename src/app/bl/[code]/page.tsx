import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { fetchSettings } from '@/lib/db'
import { supabaseServiceRole } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function cleanCode(input: string) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z]/g, '')
}

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

function isVideoUrl(input?: string | null) {
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(String(input || ''))
}

function extractPostId(targetPath?: string | null) {
  const s = String(targetPath || '')
  const byLegacyPath = s.match(/\/blessings\/p\/([0-9a-f-]{36})/i)
  if (byLegacyPath?.[1]) return byLegacyPath[1]
  const byHash = s.match(/#post-([0-9a-f-]{36})/i)
  if (byHash?.[1]) return byHash[1]
  return null
}

type ResolvedBlessing = {
  postId: string | null
  eventId: string | null
  target: string | null
  post: any | null
}

async function resolve(code: string): Promise<ResolvedBlessing | null> {
  const srv = supabaseServiceRole()

  const { data: row } = await srv
    .from('short_links')
    .select('code, kind, event_id, post_id, target_path')
    .eq('code', code)
    .maybeSingle()

  if (!row) return null

  const kind = String((row as any).kind || '').trim()
  if (kind && kind !== 'bl') return null

  let postId = ((row as any).post_id ? String((row as any).post_id) : '') || extractPostId((row as any).target_path)
  let eventId = ((row as any).event_id ? String((row as any).event_id) : '') || ''
  let post: any = null

  if (postId) {
    const { data } = await srv
      .from('posts')
      .select('id, event_id, author_name, text, media_url, video_url, link_url, created_at, status, kind')
      .eq('id', postId)
      .maybeSingle()

    if (data && String((data as any).kind || '') === 'blessing') {
      post = data
      if (!eventId) eventId = String((data as any).event_id || '')
      postId = String((data as any).id || postId)
    }
  }

  const normalizedTarget = postId
    ? `${eventId ? `/${encodeURIComponent(eventId)}` : ''}/blessings#post-${encodeURIComponent(postId)}`
    : String((row as any).target_path || '').trim() || null

  return {
    postId: postId || null,
    eventId: eventId || null,
    target: normalizedTarget,
    post,
  }
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const code = cleanCode(params.code)
  if (!code) return {}

  const resolved = await resolve(code)
  if (!resolved) return {}

  const settings = resolved.eventId ? await fetchSettings(resolved.eventId).catch(() => null) : null
  const eventName = String((settings as any)?.event_name || resolved.eventId || 'אירוע')
  const author = String((resolved.post as any)?.author_name || '').trim()
  const text = String((resolved.post as any)?.text || '').trim()
  const title = author ? `${eventName} · ברכה מ${author}` : `${eventName} · ברכה`
  const description = text || 'לחצו לצפייה בברכה'

  const postHasImage = (() => {
    const mediaUrl = String((resolved.post as any)?.media_url || '').trim()
    return !!mediaUrl && !isVideoUrl(mediaUrl)
  })()

  const fallbackOg = String((settings as any)?.og_default_image_url || '').trim() || `${baseUrl()}/api/og/image?default=1`
  const ogImage = postHasImage && resolved.postId
    ? `${baseUrl()}/api/og/image?post=${encodeURIComponent(resolved.postId)}&v=${encodeURIComponent(code)}`
    : fallbackOg
  const pageUrl = `${baseUrl()}/bl/${encodeURIComponent(code)}`

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title,
      description,
      url: pageUrl,
      type: 'website',
      images: ogImage ? [{ url: ogImage, width: 600, height: 600 }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  }
}

export default async function ShortBLLinkPage({ params }: { params: { code: string } }) {
  const code = cleanCode(params.code)
  if (!code) notFound()

  const resolved = await resolve(code)
  if (!resolved?.target) notFound()

  const href = resolved.target

  return (
    <main dir="rtl" className="mx-auto max-w-md p-6 text-center">
      <p className="text-sm text-zinc-600">מעבירים אותך לברכה…</p>
      <a className="mt-3 inline-block rounded-full border px-4 py-2 text-sm no-underline" href={href}>
        אם לא עברת אוטומטית — לחץ כאן
      </a>

      <script
        dangerouslySetInnerHTML={{
          __html: `setTimeout(function(){ window.location.href = ${JSON.stringify(href)}; }, 60);`,
        }}
      />
    </main>
  )
}
