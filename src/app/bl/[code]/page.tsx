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

async function resolve(code: string) {
  const srv = supabaseServiceRole()

  const { data } = await srv
    .from('short_links')
    .select('target_path, event_id, post_id')
    .eq('code', code)
    .maybeSingle()

  return data
}

async function loadPost(eventId: string | null, postId: string | null) {
  if (!eventId || !postId) return null

  const srv = supabaseServiceRole()

  const { data } = await srv
    .from('posts')
    .select('id,event_id,author_name,text,media_url')
    .eq('event_id', eventId)
    .eq('id', postId)
    .maybeSingle()

  return data
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {

  const code = cleanCode(params.code)
  if (!code) return {}

  const resolved = await resolve(code)
  if (!resolved) return {}

  const post = await loadPost(resolved.event_id, resolved.post_id)

  const title = post?.author_name
    ? `ברכה מ-${post.author_name}`
    : 'ברכה'

  const description = String(post?.text || 'לחצו לצפייה בברכה').slice(0,180)

  const image = toAbsoluteUrl(
    post?.media_url || '/og-fallback.png'
  )

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: image }]
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image]
    }
  }
}

export default async function Page({ params }: { params: { code: string } }) {

  const code = cleanCode(params.code)
  if (!code) notFound()

  const resolved = await resolve(code)
  if (!resolved) notFound()

  const target =
    resolved.event_id && resolved.post_id
      ? `/${resolved.event_id}/blessings#post-${resolved.post_id}`
      : resolved.target_path || '/blessings'

  return (
    <main dir="rtl" className="mx-auto max-w-xl p-6 text-right">
      <script
        dangerouslySetInnerHTML={{
          __html: `window.location.replace(${JSON.stringify(target)})`
        }}
      />

      <div className="rounded-2xl border p-5">
        מעביר לברכה...
      </div>
    </main>
  )
}
