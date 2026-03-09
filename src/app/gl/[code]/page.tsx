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

async function resolveTarget(code: string) {
  const srv = supabaseServiceRole()
  const { data: row } = await srv
    .from('short_links')
    .select('target_path, kind, media_item_id, event_id')
    .eq('code', code)
    .maybeSingle()

  const eventId = String((row as any)?.event_id || '').trim()
  const mediaItemId = String((row as any)?.media_item_id || '').trim()
  const targetPath = String((row as any)?.target_path || '').trim()

  if (mediaItemId) {
    const { data: mi } = await srv.from('media_items').select('id,event_id').eq('id', mediaItemId).maybeSingle()
    return {
      mediaItemId,
      eventId: String((mi as any)?.event_id || '').trim() || eventId,
      target: `/media/${encodeURIComponent(mediaItemId)}`
    }
  }

  if (targetPath) {
    if (/^\/media\/([0-9a-f-]{36})$/i.test(targetPath)) {
      const id = targetPath.match(/^\/media\/([0-9a-f-]{36})$/i)?.[1] || ''
      if (id) {
        const { data: mi } = await srv.from('media_items').select('id,event_id').eq('id', id).maybeSingle()
        return {
          mediaItemId: id,
          eventId: String((mi as any)?.event_id || '').trim() || eventId,
          target: `/media/${encodeURIComponent(id)}`
        }
      }
    }

    if (eventId && /^\/gallery(?:\/.*)?$/i.test(targetPath)) {
      return { mediaItemId: null, eventId, target: `/${eventId}${targetPath}` }
    }
    if (/^\/[a-z0-9_-]+\/gallery(?:\/.*)?$/i.test(targetPath)) {
      return { mediaItemId: null, eventId, target: targetPath }
    }

    if (/\/gallery\/([0-9a-f-]{36})/i.test(targetPath)) {
      const gid = targetPath.match(/\/gallery\/([0-9a-f-]{36})/i)?.[1] || ''
      if (gid) {
        const { data: g } = await srv.from('galleries').select('id,event_id').eq('id', gid).maybeSingle()
        const resolvedEventId = String((g as any)?.event_id || '').trim() || eventId
        if (resolvedEventId) return { mediaItemId: null, eventId: resolvedEventId, target: `/${resolvedEventId}/gallery/${gid}` }
      }
    }
  }

  return null
}

async function getOgForMedia(mediaItemId: string) {
  const srv = supabaseServiceRole()
  const { data: mi } = await srv
    .from('media_items')
    .select('id, gallery_id, public_url, storage_path, url, thumb_url, event_id')
    .eq('id', mediaItemId)
    .maybeSingle()

  const directUrl =
    String((mi as any)?.thumb_url || '').trim() ||
    String((mi as any)?.public_url || '').trim() ||
    String((mi as any)?.url || '').trim() ||
    (String((mi as any)?.storage_path || '').trim() ? toPublic(String((mi as any).storage_path)) : '')

  let galleryTitle = 'תמונה'
  if ((mi as any)?.gallery_id) {
    const { data: g } = await srv.from('galleries').select('id,title').eq('id', String((mi as any).gallery_id)).maybeSingle()
    if ((g as any)?.title) galleryTitle = String((g as any).title)
  }

  let eventName = 'אירוע'
  const eventId = String((mi as any)?.event_id || '').trim()
  if (eventId) {
    const { data: settings } = await srv
      .from('event_settings')
      .select('event_name,share_gallery_description')
      .eq('event_id', eventId)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if ((settings as any)?.event_name) eventName = String((settings as any).event_name)
    const description = String((settings as any)?.share_gallery_description || '').trim() || 'לחצו לצפייה בתמונה'
    return { eventName, galleryTitle, description, ogImage: directUrl || `${baseUrl()}/api/og/image?media=${encodeURIComponent(mediaItemId)}` }
  }

  return { eventName, galleryTitle, description: 'לחצו לצפייה בתמונה', ogImage: directUrl || `${baseUrl()}/api/og/image?media=${encodeURIComponent(mediaItemId)}` }
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const code = cleanCode(params.code)
  if (!code) return {}
  const resolved = await resolveTarget(code)
  if (!resolved?.mediaItemId) return {}

  const { eventName, galleryTitle, description, ogImage } = await getOgForMedia(resolved.mediaItemId)
  const title = `${eventName} · ${galleryTitle}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: [{ url: ogImage, width: 630, height: 630 }]
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage]
    }
  }
}

export default async function ShortGLLinkPage({ params }: { params: { code: string } }) {
  const code = cleanCode(params.code)
  if (!code) notFound()

  const resolved = await resolveTarget(code)
  if (!resolved) notFound()

  const href = resolved.target

  return (
    <main dir="rtl" className="mx-auto max-w-md p-6 text-center">
      <p className="text-sm text-zinc-600">מעבירים אותך לתמונה…</p>
      <a className="mt-3 inline-block rounded-full border px-4 py-2 text-sm no-underline" href={href}>
        אם לא עברת אוטומטית — לחץ כאן
      </a>

      <script
        dangerouslySetInnerHTML={{
          __html: `setTimeout(function(){ window.location.href = ${JSON.stringify(href)}; }, 60);`
        }}
      />
    </main>
  )
}
