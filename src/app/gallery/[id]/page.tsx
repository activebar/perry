import Link from 'next/link'

import { Container, Card } from '@/components/ui'
import { supabaseAnon } from '@/lib/supabase'
import { getServerEnv } from '@/lib/env'

import GalleryClient from '../ui'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: { id: string }
}

export default async function GalleryByIdPage({ params }: PageProps) {
  const env = getServerEnv()
  const galleryId = decodeURIComponent(params.id)
  const sb = supabaseAnon()

  // current gallery
  const { data: g } = await sb
    .from('galleries')
    .select('id, title, upload_enabled')
    .eq('event_id', env.EVENT_SLUG)
    .eq('id', galleryId)
    .maybeSingle()

  const title = String((g as any)?.title || 'גלריה')
  const uploadEnabled = Boolean((g as any)?.upload_enabled)

  // nav: all active galleries for this event
  const { data: galleriesNav } = await sb
    .from('galleries')
    .select('id, title')
    .eq('event_id', env.EVENT_SLUG)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  // items
  const { data: items } = await sb
    .from('media_items')
    .select('id, url, thumb_url, created_at, editable_until, is_approved')
    .eq('kind', 'gallery')
    .eq('gallery_id', galleryId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(500)

  return (
    <main className="py-10">
      <Container>
        <div dir="rtl" className="mb-4 text-center">
          <h1 className="text-2xl font-semibold">{title}</h1>
        </div>

        {/* galleries nav */}
        {(galleriesNav || []).length > 0 ? (
          <div dir="rtl" className="mb-4">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(galleriesNav || []).map((x: any) => {
                const active = String(x.id) === String(galleryId)
                return (
                  <Link
                    key={String(x.id)}
                    href={`/gallery/${encodeURIComponent(String(x.id))}`}
                    className={[
                      'whitespace-nowrap rounded-full border px-4 py-2 text-sm transition',
                      active
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-zinc-900 border-zinc-200 hover:bg-zinc-50',
                    ].join(' ')}
                  >
                    {String(x.title || 'גלריה')}
                  </Link>
                )
              })}
            </div>
          </div>
        ) : null}

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
