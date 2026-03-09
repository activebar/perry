import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
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

async function getRow(code: string) {
  const srv = supabaseServiceRole()
  const { data } = await srv
    .from('short_links')
    .select('code, target_path, kind, event_id, post_id')
    .eq('code', code)
    .maybeSingle()
  return data as any
}

async function resolve(code: string) {
  const srv = supabaseServiceRole()
  const row = await getRow(code)

  const kind = String((row as any)?.kind || '').trim()
  const eventId = String((row as any)?.event_id || '').trim()
  const postId = String((row as any)?.post_id || '').trim()
  const targetPath = String((row as any)?.target_path || '').trim()

  if (postId) {
    const { data: post } = await srv.from('posts').select('id,event_id,status').eq('id', postId).maybeSingle()
    const postEventId = String((post as any)?.event_id || '').trim() || eventId
    if (postEventId) {
      return `/${postEventId}/blessings#post-${postId}`
    }
  }

  if (targetPath) {
    if (/^\/[a-z0-9_-]+\/blessings(?:#.*)?$/i.test(targetPath)) return targetPath
    if (/^\/blessings(?:#.*)?$/i.test(targetPath) && eventId) return `/${eventId}${targetPath}`
    if (/^\/blessings\/p\/([0-9a-f-]{36})$/i.test(targetPath)) {
      const id = targetPath.match(/^\/blessings\/p\/([0-9a-f-]{36})$/i)?.[1]
      if (id) return eventId ? `/${eventId}/blessings#post-${id}` : `/blessings#post-${id}`
    }
    if (!kind || kind === 'bl') return targetPath
  }

  return null
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const code = cleanCode(params.code)
  if (!code) return {}

  const srv = supabaseServiceRole()
  const row = await getRow(code)
  const postId = String((row as any)?.post_id || '').trim()
  const eventIdFromLink = String((row as any)?.event_id || '').trim()
  if (!postId) return {}

  const { data: post } = await srv
    .from('posts')
    .select('id,event_id,author_name,text,media_url,status,kind')
    .eq('id', postId)
    .maybeSingle()

  if (!post || String((post as any)?.kind || '') !== 'blessing') return {}

  const eventId = String((post as any)?.event_id || '').trim() || eventIdFromLink
  let eventName = 'אירוע'
  let shareDescription = 'לחצו לקריאת הברכה'
  if (eventId) {
    const { data: settings } = await srv
      .from('event_settings')
      .select('event_name,share_blessings_description')
      .eq('event_id', eventId)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if ((settings as any)?.event_name) eventName = String((settings as any).event_name)
    if ((settings as any)?.share_blessings_description) shareDescription = String((settings as any).share_blessings_description)
  }

  const author = String((post as any)?.author_name || '').trim()
  const text = String((post as any)?.text || '').replace(/\s+/g, ' ').trim()
  const title = author ? `ברכות - ${eventName}` : `ברכה - ${eventName}`
  const description = text || shareDescription
  const ogImage = `${baseUrl()}/api/og/image?post=${encodeURIComponent(postId)}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: [{ url: ogImage, width: 630, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  }
}

export default async function ShortBLLinkPage({ params }: { params: { code: string } }) {
  const code = cleanCode(params.code)
  if (!code) notFound()

  const target = await resolve(code)
  if (!target) notFound()

  redirect(target)
}
