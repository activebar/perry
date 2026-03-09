import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
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

function toPublic(storagePath: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  return supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/uploads/${storagePath}` : ''
}

async function resolveLink(code: string) {
  const srv = supabaseServiceRole()
  const { data: row } = await srv
    .from('short_links')
    .select('code, target_path, kind, event_id, post_id')
    .eq('code', code)
    .maybeSingle()

  const eventId = String((row as any)?.event_id || '').trim()
  const postId = String((row as any)?.post_id || '').trim()
  const targetPath = String((row as any)?.target_path || '').trim()

  let post: any = null
  let resolvedEventId = eventId
  if (postId) {
    const { data } = await srv
      .from('posts')
      .select('id,event_id,status,text,author_name,media_url,media_path')
      .eq('id', postId)
      .maybeSingle()
    post = data
    resolvedEventId = String((data as any)?.event_id || '').trim() || resolvedEventId
  }

  let target = ''
  if (postId && resolvedEventId) target = `/${resolvedEventId}/blessings#post-${postId}`
  else if (targetPath && /^\/[a-z0-9_-]+\/blessings(?:#.*)?$/i.test(targetPath)) target = targetPath
  else if (targetPath && /^\/blessings(?:#.*)?$/i.test(targetPath) && resolvedEventId) target = `/${resolvedEventId}${targetPath}`
  else if (targetPath) target = targetPath

  return { row, post, eventId: resolvedEventId, postId, target }
}

async function getOgData(code: string) {
  const srv = supabaseServiceRole()
  const resolved = await resolveLink(code)
  if (!resolved.target) return null

  let eventName = 'אירוע'
  let description = 'לחצו לצפייה בברכה'
  let fallbackOg = ''
  if (resolved.eventId) {
    const { data: settings } = await srv
      .from('event_settings')
      .select('event_name,blessings_title,meta_description,og_default_image_url')
      .eq('event_id', resolved.eventId)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if ((settings as any)?.event_name) eventName = String((settings as any).event_name)
    if ((settings as any)?.meta_description) description = String((settings as any).meta_description)
    if ((settings as any)?.blessings_title) description = String((settings as any).blessings_title)
    fallbackOg = String((settings as any)?.og_default_image_url || '').trim()
  }

  const author = String((resolved.post as any)?.author_name || '').trim()
  const text = String((resolved.post as any)?.text || '').replace(/\s+/g, ' ').trim()
  const mediaUrl = String((resolved.post as any)?.media_url || '').trim()
  const mediaPath = String((resolved.post as any)?.media_path || '').trim()
  const ogImage = mediaUrl || (mediaPath ? toPublic(mediaPath) : '') || fallbackOg || `${baseUrl()}/og-fallback.png`
  const title = author ? `${author} · ${eventName}` : `${eventName} · ברכה`
  const finalDescription = text || description || 'לחצו לצפייה בברכה'

  return { ...resolved, title, description: finalDescription, ogImage }
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const code = cleanCode(params.code)
  if (!code) return {}
  const data = await getOgData(code)
  if (!data) return {}

  return {
    title: data.title,
    description: data.description,
    openGraph: {
      title: data.title,
      description: data.description,
      type: 'website',
      images: [{ url: data.ogImage, width: 630, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: data.title,
      description: data.description,
      images: [data.ogImage],
    },
  }
}

export default async function ShortBLLinkPage({ params }: { params: { code: string } }) {
  const code = cleanCode(params.code)
  if (!code) notFound()

  const data = await getOgData(code)
  if (!data?.target) notFound()

  const href = data.target
  return (
    <main dir="rtl" className="mx-auto max-w-md p-6 text-center">
      <p className="text-sm text-zinc-600">מעבירים אותך לברכה…</p>
      <a className="mt-3 inline-block rounded-full border px-4 py-2 text-sm no-underline" href={href}>
        אם לא עברת אוטומטית — לחץ כאן
      </a>
      <script
        dangerouslySetInnerHTML={{
          __html: `setTimeout(function(){ window.location.href = ${JSON.stringify(href)}; }, 120);`
        }}
      />
    </main>
  )
}
