import type { Metadata } from 'next'
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

async function resolve(code: string) {
  const srv = supabaseServiceRole()
  const { data: row } = await srv
    .from('short_links')
    .select('code, target_path, kind, event_id, post_id')
    .eq('code', code)
    .maybeSingle()

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

async function getMetadataForCode(code: string) {
  const srv = supabaseServiceRole()
  const { data: row } = await srv
    .from('short_links')
    .select('code, event_id, post_id, target_path')
    .eq('code', code)
    .maybeSingle()

  const postId = String((row as any)?.post_id || '').trim()
  const eventIdFromRow = String((row as any)?.event_id || '').trim()
  if (!postId) return null

  const { data: post } = await srv
    .from('posts')
    .select('id,event_id,author_name,text,media_url,status')
    .eq('id', postId)
    .maybeSingle()

  if (!post) return null

  const eventId = String((post as any)?.event_id || '').trim() || eventIdFromRow
  let eventName = 'ברכות'
  if (eventId) {
    const { data: settings } = await srv
      .from('event_settings')
      .select('event_name,share_blessing_description')
      .eq('event_id', eventId)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if ((settings as any)?.event_name) eventName = String((settings as any).event_name)
  }

  const author = String((post as any)?.author_name || '').trim()
  const body = String((post as any)?.text || '').replace(/\s+/g, ' ').trim()
  const title = author ? `${eventName} · ברכה מ${author}` : `${eventName} · ברכה`
  const description = body ? body.slice(0, 140) : 'לחצו לצפייה בברכה'
  const ogImage = `${process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')}/api/og/image?post=${encodeURIComponent(postId)}`

  return { title, description, ogImage }
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const code = cleanCode(params.code)
  if (!code) return {}
  const meta = await getMetadataForCode(code)
  if (!meta) return {}
  return {
    title: meta.title,
    description: meta.description,
    openGraph: { title: meta.title, description: meta.description, type: 'website', images: [{ url: meta.ogImage, width: 630, height: 630 }] },
    twitter: { card: 'summary_large_image', title: meta.title, description: meta.description, images: [meta.ogImage] }
  }
}

export default async function ShortBLLinkPage({ params }: { params: { code: string } }) {
  const code = cleanCode(params.code)
  if (!code) notFound()

  const target = await resolve(code)
  if (!target) notFound()

  redirect(target)
}
