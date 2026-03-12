import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseServiceRole } from '@/lib/supabase'
import { toAbsoluteUrl } from '@/lib/site-url'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type PostRow = {
  id: string
  created_at: string | null
  author_name: string | null
  text: string | null
  media_url: string | null
  video_url: string | null
  link_url: string | null
  event_id?: string | null
}

type EventSettingsRow = {
  blessings_title?: string | null
  blessings_show_all_label?: string | null
}

async function getPost(postId: string): Promise<PostRow | null> {
  const sb = supabaseServiceRole()
  const { data } = await sb
    .from('posts')
    .select('id, created_at, author_name, text, media_url, video_url, link_url, event_id')
    .eq('id', postId)
    .eq('kind', 'blessing')
    .maybeSingle()
  return (data as any) || null
}

async function getEventSettings(eventId?: string | null): Promise<EventSettingsRow | null> {
  const event = String(eventId || '').trim()
  if (!event) return null

  const sb = supabaseServiceRole()
  const { data } = await sb
    .from('event_settings')
    .select('blessings_title, blessings_show_all_label')
    .eq('event_id', event)
    .maybeSingle()

  return (data as any) || null
}


export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const post = await getPost(String(params?.id || '').trim())
  if (!post) {
    return {
      title: 'ברכה',
      openGraph: {
        title: 'ברכה',
        images: [{ url: toAbsoluteUrl('/api/og/image?default=1')!, width: 630, height: 630 }],
      },
    }
  }

  const eventSettings = await getEventSettings(post.event_id)
  const blessingsTitle = String(eventSettings?.blessings_title || 'ברכות').trim() || 'ברכות'
  const title = post.author_name ? `${blessingsTitle} מאת ${post.author_name}` : `${blessingsTitle} מהאירוע`
  const description = String(post.text || `לחצו לראות את ה${blessingsTitle.slice(0, -1) || 'ברכה'}`).trim() || `לחצו לראות את ה${blessingsTitle.slice(0, -1) || 'ברכה'}`
  const url = toAbsoluteUrl(`/blessings/p/${post.id}`)
  const image = toAbsoluteUrl(`/api/og/image?post=${post.id}`)

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: 'article',
      images: image ? [{ url: image, width: 630, height: 630 }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image ? [image] : undefined,
    },
  }
}

export default async function BlessingSharePage({ params }: { params: { id: string } }) {
  const post = await getPost(String(params?.id || '').trim())
  if (!post) notFound()

  const eventHref = post.event_id ? `/${encodeURIComponent(String(post.event_id))}/blessings` : '/'
  const image = String(post.media_url || '').trim()
  const video = String(post.video_url || '').trim()
  const eventSettings = await getEventSettings(post.event_id)
  const blessingsTitle = String(eventSettings?.blessings_title || 'ברכות').trim() || 'ברכות'
  const blessingsAllLabel = String(eventSettings?.blessings_show_all_label || `לכל ה${blessingsTitle}`)

  return (
    <main dir="rtl" className="min-h-screen bg-zinc-50 px-4 py-8 text-right">
      <div className="mx-auto max-w-2xl rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 text-sm text-zinc-500">{`${blessingsTitle} מהאירוע`}</div>
        <h1 className="text-2xl font-bold text-zinc-900">{post.author_name || 'אורח/ת'}</h1>
        {post.created_at ? (
          <div className="mt-1 text-sm text-zinc-500">{new Date(post.created_at).toLocaleString('he-IL')}</div>
        ) : null}

        {image ? (
          <img src={image} alt={post.author_name || blessingsTitle} className="mt-5 w-full rounded-3xl border border-zinc-200 object-cover" />
        ) : null}
        {!image && video ? (
          <video src={video} controls className="mt-5 w-full rounded-3xl border border-zinc-200" />
        ) : null}

        {post.text ? <p className="mt-5 whitespace-pre-wrap text-lg leading-8 text-zinc-800">{post.text}</p> : null}
        {post.link_url ? (
          <a href={post.link_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm text-sky-700 underline">
            פתחו קישור מצורף
          </a>
        ) : null}

        <div className="mt-8">
          <Link href={eventHref} className="inline-flex rounded-2xl bg-zinc-900 px-5 py-3 text-white">
            {blessingsAllLabel}
          </Link>
        </div>
      </div>
    </main>
  )
}
