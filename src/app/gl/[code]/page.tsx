import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabaseServiceRole } from '@/lib/supabase'
import { fetchSettings } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function cleanCode(input: string) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z]/g, '')
}

async function resolveTarget(code: string) {
  const srv = supabaseServiceRole()

  // Prefer schemas that include kind, but fallback to legacy schema without kind.
  const first = await srv.from('short_links').select('target_path, kind').eq('code', code).maybeSingle()
  if ((first.data as any)?.target_path) {
    const k = String((first.data as any).kind || '').trim()
    if (!k || k === 'gl') return String((first.data as any).target_path)
  }

  // Legacy fallback: some schemas may not have `kind` column at all.
  const second = await srv.from('short_links').select('target_path').eq('code', code).maybeSingle()
  return (second.data as any)?.target_path ? String((second.data as any).target_path) : null
}

function baseUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/$/, '')
  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`.replace(/\/$/, '')
  return ''
}

function extractGalleryIdFromTarget(targetPath: string | null) {
  if (!targetPath) return null
  const m = String(targetPath).match(/\/gallery\/([0-9a-f-]{36})/i)
  return m?.[1] || null
}

async function getOgForGallery(galleryId: string) {
  const srv = supabaseServiceRole()
  const settings = await fetchSettings()

  const { data: g } = await srv
    .from('galleries')
    .select('id,title')
    .eq('id', galleryId)
    .maybeSingle()

  const { data: mi } = await srv
    .from('media_items')
    .select('id')
    .eq('kind', 'gallery')
    .eq('gallery_id', galleryId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const eventName = String((settings as any)?.event_name || 'אירוע')
  const galleryTitle = String((g as any)?.title || 'גלריה')
  const description =
    String((settings as any)?.share_gallery_description || '').trim() ||
    'לחצו לצפייה בגלריה והעלאת תמונות'

  const b = baseUrl()
  const ogImage = mi?.id ? `${b}/api/og/image?media=${encodeURIComponent(String(mi.id))}` : `${b}/api/og/image?default=1`

  return { eventName, galleryTitle, description, ogImage }
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const code = cleanCode(params.code)
  if (!code) return {}

  const target = await resolveTarget(code)
  const galleryId = extractGalleryIdFromTarget(target)
  if (!galleryId) return {}

  const { eventName, galleryTitle, description, ogImage } = await getOgForGallery(galleryId)
  const title = `${eventName} · ${galleryTitle}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: [{ url: ogImage, width: 800, height: 800 }]
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

  const target = await resolveTarget(code)
  if (!target) notFound()

  // Client-side redirect so WhatsApp/Facebook can fetch OG tags from the HTML.
  const href = target.startsWith('http') ? target : target

  return (
    <main dir="rtl" className="mx-auto max-w-md p-6 text-center">
      <p className="text-sm text-zinc-600">מעבירים אותך לגלריה…</p>
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
