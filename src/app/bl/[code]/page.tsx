import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabaseServiceRole } from '@/lib/supabase'
import { toAbsoluteUrl } from '@/lib/site-url'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function cleanCode(input: string) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z]/g, '')
}

type ResolvedLink = {
  targetPath: string | null
  eventId: string | null
  postId: string | null
}

async function resolve(code: string): Promise<ResolvedLink> {
  const srv = supabaseServiceRole()

  const first = await srv
    .from('short_links')
    .select('target_path, kind, event_id, post_id')
    .eq('code', code)
    .maybeSingle()

  if (first.data?.target_path) {
    const row: any = first.data
    const k = String(row.kind || '').trim()
    if (!k || k === 'bl') {
      return {
        targetPath: String(row.target_path || ''),
        eventId: row.event_id ? String(row.event_id) : null,
        postId: row.post_id ? String(row.post_id) : null,
      }
    }
  }

  const second = await srv
    .from('short_links')
    .select('target_path, event_id, post_id')
    .eq('code', code)
    .maybeSingle()

  const row: any = second.data || null
  return {
    targetPath: row?.target_path ? String(row.target_path) : null,
    eventId: row?.event_id ? String(row.event_id) : null,
    postId: row?.post_id ? String(row.post_id) : null,
  }
}

async function loadPost(eventId: string | null, postId: string | null) {
  if (!eventId || !postId) return null
  const srv = supabaseServiceRole()
  const res = await srv
    .from('posts')
    .select('id,event_id,author_name,text,media_url,video_url,created_at')
    .eq('event_id', eventId)
    .eq('id', postId)
    .maybeSingle()
  return (res.data as any) || null
}

function buildBlessingTarget(eventId: string | null, postId: string | null, fallback: string | null) {
  if (eventId && postId) return `/${encodeURIComponent(eventId)}/blessings#post-${postId}`
  return fallback || '/blessings'
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const code = cleanCode(params.code)
  if (!code) return {}

  const resolved = await resolve(code)
  const post = await loadPost(resolved.eventId, resolved.postId)
  const target = buildBlessingTarget(resolved.eventId, resolved.postId, resolved.targetPath)

  const title = post?.author_name
    ? `ברכה מ-${post.author_name}`
    : resolved.eventId
      ? `ברכות - ${resolved.eventId}`
      : 'ברכה'

  const description = String(post?.text || 'לחצו לצפייה בברכה').slice(0, 180)
  const image = toAbsoluteUrl(post?.media_url || '/og-fallback.png')

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: toAbsoluteUrl(`/bl/${code}`),
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      images: image ? [image] : undefined,
    },
    alternates: {
      canonical: toAbsoluteUrl(target),
    },
  }
}

export default async function ShortBLLinkPage({ params }: { params: { code: string } }) {
  const code = cleanCode(params.code)
  if (!code) notFound()

  const resolved = await resolve(code)
  const target = buildBlessingTarget(resolved.eventId, resolved.postId, resolved.targetPath)
  if (!target) notFound()

  return (
    <main dir="rtl" className="mx-auto max-w-xl p-6 text-right">
      <script dangerouslySetInnerHTML={{ __html: `window.location.replace(${JSON.stringify(target)})` }} />
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-lg font-semibold">מעביר לברכה…</div>
        <p className="mt-2 text-sm text-zinc-600">אם המעבר לא קורה אוטומטית, לחצו על הקישור.</p>
        <a href={target} className="mt-3 inline-block text-sm font-medium underline underline-offset-4">
          פתח את הברכה
        </a>
      </div>
    </main>
  )
}
