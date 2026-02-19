import Link from 'next/link'

import { Container, Card } from '@/components/ui'
import { supabaseServiceRole } from '@/lib/supabase'
import { getServerEnv } from '@/lib/env'

import GalleryClient from '../ui'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: { id: string }
}

export default async function GalleryByIdPage({ params }: PageProps) {
  const galleryId = decodeURIComponent(params.id)
  const env = getServerEnv()
  const sb = supabaseServiceRole()

  // gallery settings (upload gating + auto approve window handled in API)
  const { data: g } = await sb.from('galleries').select('id, title, upload_enabled').eq('event_id', env.EVENT_SLUG).eq('id', galleryId).maybeSingle()

  const uploadEnabled = !!(g as any)?.upload_enabled

  // Visible galleries navigation (based on blocks)
  const { data: navBlocks } = await sb
    .from('blocks')
    .select('*')
    .eq('event_id', env.EVENT_SLUG)
    .eq('is_visible', true)
    .order('order_index', { ascending: true })

  const galleryBlocks = (navBlocks || []).filter((b: any) => {
    const t = String((b as any)?.type || '')
    return t === 'gallery' || t.startsWith('gallery_')
  })

  const navIds = Array.from(
    new Set(
      galleryBlocks
        .map((b: any) => (b?.config as any)?.gallery_id || (b?.config as any)?.galleryId)
        .filter(Boolean)
        .map((x: any) => String(x))
    )
  )

  const navTitles = new Map<string, string>()
  if (navIds.length) {
    const { data: gs } = await sb.from('galleries').select('id,title').eq('event_id', env.EVENT_SLUG).in('id', navIds as any)
    for (const row of gs || []) navTitles.set(String((row as any).id), String((row as any).title || '').trim())
  }

  const nav = navIds.map(id => ({ id, title: navTitles.get(id) || 'גלריה' }))

  const { data: items } = await sb
    .from('media_items')
    .select('id, url, thumb_url, created_at, editable_until, is_approved')
    .eq('event_id', env.EVENT_SLUG)
    .eq('kind', 'gallery')
    .eq('gallery_id', galleryId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(500)

  const title = (g as any)?.title || 'גלריה'

  return (
    <main className="py-10">
      <Container>
        <div dir="rtl" className="mb-6 flex items-center justify-between gap-3">
          <div className="text-right">
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-zinc-600">כל התמונות המאושרות בגלריה זו.</p>
          </div>
          <Link href="/" className="text-sm font-medium underline">
            חזרה לדף הבית
          </Link>
        {nav.length > 1 ? (
          <div dir="rtl" className="mb-4 flex flex-wrap justify-end gap-2">
            {nav.map(gx => (
              <Link
                key={gx.id}
                href={`/gallery/${encodeURIComponent(gx.id)}`}
                className={`rounded-full border px-3 py-1 text-sm ${
                  gx.id === galleryId ? 'bg-black text-white' : 'bg-white'
                }`}
              >
                {gx.title}
              </Link>
            ))}
          </div>
        ) : null}

        </div>

        {(items || []).length === 0 ? (
          <Card dir="rtl">
            <div className="text-right text-sm text-zinc-600">אין תמונות עדיין.</div>
          </Card>
        ) : null}

        <GalleryClient initialItems={items || []} galleryId={galleryId} uploadEnabled={uploadEnabled} />
      </Container>
    </main>
  )
}
